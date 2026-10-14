"""
Главное окно настольного приложения на базе PySide6.
"""

import os
from typing import Optional, Dict, Any
import pandas as pd
import networkx as nx

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QTabWidget,
    QPushButton, QLabel, QFileDialog, QMessageBox, QTableWidget,
    QTableWidgetItem, QSpinBox, QLineEdit, QComboBox, QGroupBox,
    QSplitter, QHeaderView, QStatusBar, QDialog, QFormLayout, QDialogButtonBox
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QColor
from matplotlib.figure import Figure

from app.excel_loader import (
    load_publications_excel, get_excel_sheet_names, detect_columns, ExcelLoadError
)
from app.graph_builder import CoauthorshipGraphBuilder
from app.matrix_builder import build_adjacency_matrix
from app.graph_visualizer import draw_coauthorship_graph, FigureCanvas, NavigationToolbar
from app.statistics import calculate_network_statistics, get_authors_summary_table
from app.exporter import (
    export_matrix_to_xlsx, export_matrix_to_csv, export_authors_to_xlsx,
    export_edges_to_xlsx, export_statistics_to_xlsx, export_graph_image_png, ExportError
)


class MainWindow(QMainWindow):
    """
    Основное окно приложения 'Анализ научных связей'.
    """

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Анализ научных связей")
        self.resize(1150, 780)

        # Состояние приложения
        self.current_file_path: Optional[str] = None
        self.raw_df: Optional[pd.DataFrame] = None
        self.graph_builder = CoauthorshipGraphBuilder()
        self.current_graph: nx.Graph = nx.Graph()
        self.adjacency_matrix_df: pd.DataFrame = pd.DataFrame()
        self.current_stats: Dict[str, Any] = {}
        self.graph_pos: Optional[Dict[Any, Any]] = None

        self._init_ui()

    def _init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(10, 10, 10, 10)
        main_layout.setSpacing(8)

        # 1. Верхняя панель управления
        top_bar = QHBoxLayout()
        top_bar.setSpacing(10)

        self.btn_open = QPushButton("📁 Открыть Excel")
        self.btn_open.setFixedHeight(34)
        self.btn_open.clicked.connect(self._on_open_file)
        top_bar.addWidget(self.btn_open)

        self.lbl_file_info = QLabel("Файл не выбран")
        self.lbl_file_info.setStyleSheet("color: #475569; font-weight: 500;")
        top_bar.addWidget(self.lbl_file_info)

        top_bar.addStretch()

        self.btn_build_graph = QPushButton("⚙️ Построить граф")
        self.btn_build_graph.setFixedHeight(34)
        self.btn_build_graph.setStyleSheet("background-color: #4f46e5; color: white; font-weight: bold;")
        self.btn_build_graph.setEnabled(False)
        self.btn_build_graph.clicked.connect(self._on_build_graph)
        top_bar.addWidget(self.btn_build_graph)

        self.btn_export = QPushButton("💾 Экспорт результатов")
        self.btn_export.setFixedHeight(34)
        self.btn_export.setEnabled(False)
        self.btn_export.clicked.connect(self._on_export_dialog)
        top_bar.addWidget(self.btn_export)

        main_layout.addLayout(top_bar)

        # 2. Вкладки приложения
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)

        # Вкладка 1: Исходные данные
        self.tab_raw_data = QWidget()
        self._setup_raw_data_tab()
        self.tabs.addTab(self.tab_raw_data, "1. Исходные данные")

        # Вкладка 2: Граф соавторства
        self.tab_graph = QWidget()
        self._setup_graph_tab()
        self.tabs.addTab(self.tab_graph, "2. Граф соавторства")

        # Вкладка 3: Матрица смежности
        self.tab_matrix = QWidget()
        self._setup_matrix_tab()
        self.tabs.addTab(self.tab_matrix, "3. Матрица смежности")

        # Вкладка 4: Список авторов
        self.tab_authors = QWidget()
        self._setup_authors_tab()
        self.tabs.addTab(self.tab_authors, "4. Список авторов")

        # Вкладка 5: Статистика
        self.tab_stats = QWidget()
        self._setup_stats_tab()
        self.tabs.addTab(self.tab_stats, "5. Статистика")

        # Строка состояния
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Готово к работе. Откройте Excel-файл со списком публикаций.")

    def _setup_raw_data_tab(self):
        layout = QVBoxLayout(self.tab_raw_data)
        layout.setContentsMargins(5, 5, 5, 5)

        self.table_raw = QTableWidget()
        self.table_raw.setAlternatingRowColors(True)
        layout.addWidget(self.table_raw)

    def _setup_graph_tab(self):
        layout = QHBoxLayout(self.tab_graph)
        layout.setContentsMargins(5, 5, 5, 5)

        # Левая часть: Фильтры
        filter_panel = QGroupBox("Параметры и фильтры")
        filter_panel.setFixedWidth(260)
        f_layout = QVBoxLayout(filter_panel)
        f_layout.setSpacing(10)

        # Фильтр по годам
        f_layout.addWidget(QLabel("Диапазон лет:"))
        year_row = QHBoxLayout()
        self.spin_year_min = QSpinBox()
        self.spin_year_min.setRange(1900, 2030)
        self.spin_year_min.setValue(2000)
        self.spin_year_max = QSpinBox()
        self.spin_year_max.setRange(1900, 2030)
        self.spin_year_max.setValue(2026)
        year_row.addWidget(self.spin_year_min)
        year_row.addWidget(QLabel("—"))
        year_row.addWidget(self.spin_year_max)
        f_layout.addLayout(year_row)

        # Минимальный вес ребра
        f_layout.addWidget(QLabel("Мин. совместных статей:"))
        self.spin_min_weight = QSpinBox()
        self.spin_min_weight.setRange(1, 50)
        self.spin_min_weight.setValue(1)
        f_layout.addWidget(self.spin_min_weight)

        # Фильтр по организации
        f_layout.addWidget(QLabel("Организация:"))
        self.edit_org_filter = QLineEdit()
        self.edit_org_filter.setPlaceholderText("например, ПетрГУ или КарНЦ")
        f_layout.addWidget(self.edit_org_filter)

        # Поиск исследователя (Ego-network)
        f_layout.addWidget(QLabel("Поиск исследователя:"))
        self.edit_author_search = QLineEdit()
        self.edit_author_search.setPlaceholderText("ФИО автора")
        f_layout.addWidget(self.edit_author_search)

        self.btn_apply_filter = QPushButton("Применить фильтры")
        self.btn_apply_filter.clicked.connect(self._on_apply_filters)
        f_layout.addWidget(self.btn_apply_filter)

        self.btn_re_layout = QPushButton("↺ Пересчитать положение")
        self.btn_re_layout.clicked.connect(self._on_re_layout)
        f_layout.addWidget(self.btn_re_layout)

        self.btn_save_png = QPushButton("📷 Сохранить в PNG")
        self.btn_save_png.clicked.connect(self._on_save_png)
        f_layout.addWidget(self.btn_save_png)

        # Памятка по дипломному правилу
        memo = QLabel("💡 <b>Правило:</b> все вершины одинакового размера. Сила связи отображается <i>только цветом рёбер</i> (от светло-голубого к тёмно-синему).")
        memo.setWordWrap(True)
        memo.setStyleSheet("background-color: #f1f5f9; padding: 6px; border-radius: 4px; font-size: 11px;")
        f_layout.addWidget(memo)

        f_layout.addStretch()
        layout.addWidget(filter_panel)

        # Правая часть: Холст Matplotlib
        canvas_container = QWidget()
        canvas_layout = QVBoxLayout(canvas_container)
        canvas_layout.setContentsMargins(0, 0, 0, 0)

        self.figure = Figure(figsize=(8, 6), dpi=100)
        self.canvas = FigureCanvas(self.figure)
        self.toolbar = NavigationToolbar(self.canvas, self)

        canvas_layout.addWidget(self.toolbar)
        canvas_layout.addWidget(self.canvas)
        layout.addWidget(canvas_container)

    def _setup_matrix_tab(self):
        layout = QVBoxLayout(self.tab_matrix)
        layout.setContentsMargins(5, 5, 5, 5)

        top_info = QHBoxLayout()
        self.lbl_matrix_info = QLabel("Матрица смежности: постройте граф для просмотра.")
        top_info.addWidget(self.lbl_matrix_info)
        top_info.addStretch()

        btn_exp_mat_xlsx = QPushButton("Экспорт матрицы в XLSX")
        btn_exp_mat_xlsx.clicked.connect(lambda: self._export_single("matrix_xlsx"))
        top_info.addWidget(btn_exp_mat_xlsx)

        btn_exp_mat_csv = QPushButton("Экспорт матрицы в CSV")
        btn_exp_mat_csv.clicked.connect(lambda: self._export_single("matrix_csv"))
        top_info.addWidget(btn_exp_mat_csv)

        layout.addLayout(top_info)

        self.table_matrix = QTableWidget()
        self.table_matrix.setAlternatingRowColors(True)
        layout.addWidget(self.table_matrix)

    def _setup_authors_tab(self):
        layout = QVBoxLayout(self.tab_authors)
        layout.setContentsMargins(5, 5, 5, 5)

        self.table_authors = QTableWidget()
        self.table_authors.setAlternatingRowColors(True)
        layout.addWidget(self.table_authors)

    def _setup_stats_tab(self):
        layout = QVBoxLayout(self.tab_stats)
        layout.setContentsMargins(15, 15, 15, 15)

        self.table_stats = QTableWidget()
        self.table_stats.setColumnCount(2)
        self.table_stats.setHorizontalHeaderLabels(["Показатель", "Значение"])
        self.table_stats.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table_stats.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        layout.addWidget(self.table_stats)

    # === ОБРАБОТЧИКИ СОБЫТИЙ ===

    def _on_open_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Выберите файл с публикациями",
            "",
            "Таблицы Excel (*.xlsx *.xls);;Все файлы (*.*)"
        )
        if not file_path:
            return

        try:
            sheet_names = get_excel_sheet_names(file_path)
            selected_sheet = sheet_names[0]

            # Если листов несколько — даем выбрать
            if len(sheet_names) > 1:
                dlg = QDialog(self)
                dlg.setWindowTitle("Выбор листа Excel")
                d_layout = QVBoxLayout(dlg)
                d_layout.addWidget(QLabel("В файле обнаружено несколько листов. Выберите нужный:"))
                cmb = QComboBox()
                cmb.addItems(sheet_names)
                d_layout.addWidget(cmb)
                btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
                btns.accepted.connect(dlg.accept)
                btns.rejected.connect(dlg.reject)
                d_layout.addWidget(btns)
                if dlg.exec() == QDialog.Accepted:
                    selected_sheet = cmb.currentText()
                else:
                    return

            df, col_mapping = load_publications_excel(file_path, sheet_name=selected_sheet)
            self.raw_df = df
            self.current_file_path = file_path

            # Обновляем таблицу предпросмотра
            self._display_raw_data_table(df)

            # Обновляем интерфейс
            file_name = os.path.basename(file_path)
            self.lbl_file_info.setText(f"Файл: <b>{file_name}</b> | Публикаций: <b>{len(df)}</b>")
            self.btn_build_graph.setEnabled(True)
            self.status_bar.showMessage(f"Файл '{file_name}' успешно загружен ({len(df)} строк).")

            # Автоматически строим граф
            self._on_build_graph()

        except ExcelLoadError as e:
            QMessageBox.warning(self, "Ошибка загрузки Excel", str(e))
        except Exception as e:
            QMessageBox.critical(self, "Непредвиденная ошибка", f"Не удалось прочитать файл:\n{e}")

    def _display_raw_data_table(self, df: pd.DataFrame):
        # Показываем исходные колонки без внутренних служебных
        display_cols = [c for c in df.columns if not c.startswith("_")]
        self.table_raw.clear()
        self.table_raw.setRowCount(min(len(df), 500))  # Ограничение 500 строк для быстрой отрисовки
        self.table_raw.setColumnCount(len(display_cols))
        self.table_raw.setHorizontalHeaderLabels(display_cols)

        for row_idx in range(self.table_raw.rowCount()):
            for col_idx, col_name in enumerate(display_cols):
                val = str(df.iloc[row_idx][col_name])
                item = QTableWidgetItem(val)
                self.table_raw.setItem(row_idx, col_idx, item)

        self.table_raw.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive)

    def _on_build_graph(self):
        if self.raw_df is None or self.raw_df.empty:
            return

        self.status_bar.showMessage("Построение графа соавторства...")
        self.graph_builder.build_from_dataframe(self.raw_df)
        self._on_apply_filters()

        self.btn_export.setEnabled(True)
        self.status_bar.showMessage(
            f"Граф успешно построен: {self.current_graph.number_of_nodes()} авторов, "
            f"{self.current_graph.number_of_edges()} связей."
        )

    def _on_apply_filters(self):
        min_y = self.spin_year_min.value()
        max_y = self.spin_year_max.value()
        min_w = self.spin_min_weight.value()
        org = self.edit_org_filter.text().strip() or None
        search_auth = self.edit_author_search.text().strip() or None

        self.current_graph = self.graph_builder.apply_filters(
            min_year=min_y,
            max_year=max_y,
            organization=org,
            min_weight=min_w,
            selected_author=search_auth,
            include_neighbors_only=bool(search_auth)
        )

        # 1. Отрисовка графа
        self.graph_pos = draw_coauthorship_graph(
            self.figure,
            self.current_graph,
            show_labels=True,
            pos=None
        )
        self.canvas.draw()

        # 2. Построение матрицы смежности
        self.adjacency_matrix_df = build_adjacency_matrix(self.current_graph)
        self._display_adjacency_matrix(self.adjacency_matrix_df)

        # 3. Список авторов
        self._display_authors_table()

        # 4. Статистика
        self._display_statistics()

    def _on_re_layout(self):
        if self.current_graph.number_of_nodes() > 0:
            import random
            seed = random.randint(1, 10000)
            self.graph_pos = draw_coauthorship_graph(
                self.figure,
                self.current_graph,
                show_labels=True,
                seed=seed,
                pos=None
            )
            self.canvas.draw()

    def _on_save_png(self):
        if self.current_graph.number_of_nodes() == 0:
            QMessageBox.information(self, "Внимание", "Граф пуст.")
            return

        save_path, _ = QFileDialog.getSaveFileName(
            self, "Сохранить изображение графа", "coauthorship_graph.png", "PNG (*.png)"
        )
        if save_path:
            try:
                export_graph_image_png(self.figure, save_path, dpi=300)
                QMessageBox.information(self, "Успех", f"Изображение сохранено в:\n{save_path}")
            except ExportError as e:
                QMessageBox.critical(self, "Ошибка экспорта", str(e))

    def _display_adjacency_matrix(self, matrix_df: pd.DataFrame):
        self.table_matrix.clear()
        if matrix_df.empty:
            self.lbl_matrix_info.setText("Матрица пуста.")
            return

        n = len(matrix_df)
        self.lbl_matrix_info.setText(f"Матрица смежности размером {n} × {n} исследователей.")
        self.table_matrix.setRowCount(n)
        self.table_matrix.setColumnCount(n)
        self.table_matrix.setHorizontalHeaderLabels(list(matrix_df.columns))
        self.table_matrix.setVerticalHeaderLabels(list(matrix_df.index))

        for i in range(n):
            for j in range(n):
                val = int(matrix_df.iloc[i, j])
                item = QTableWidgetItem(str(val))
                item.setTextAlignment(Qt.AlignCenter)
                if i == j:
                    item.setBackground(QColor("#f1f5f9"))
                    item.setForeground(QColor("#94a3b8"))
                elif val > 0:
                    item.setBackground(QColor("#e0e7ff"))
                    item.setForeground(QColor("#1e3a8a"))
                    font = item.font()
                    font.setBold(True)
                    item.setFont(font)
                self.table_matrix.setItem(i, j, item)

        self.table_matrix.horizontalHeader().setDefaultSectionSize(75)

    def _display_authors_table(self):
        df_authors = get_authors_summary_table(self.current_graph)
        self.table_authors.clear()
        if df_authors.empty:
            return

        self.table_authors.setRowCount(len(df_authors))
        self.table_authors.setColumnCount(len(df_authors.columns))
        self.table_authors.setHorizontalHeaderLabels(list(df_authors.columns))

        for row_idx, row in df_authors.iterrows():
            for col_idx, col_name in enumerate(df_authors.columns):
                val = str(row[col_name])
                item = QTableWidgetItem(val)
                self.table_authors.setItem(row_idx, col_idx, item)

        self.table_authors.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)

    def _display_statistics(self):
        total_pubs = len(self.raw_df) if self.raw_df is not None else 0
        stats = calculate_network_statistics(self.current_graph, total_pubs)
        self.current_stats = stats

        items = [
            ("Количество публикаций в выборке", stats["total_publications"]),
            ("Количество уникальных исследователей", stats["total_authors"]),
            ("Количество рёбер (связей)", stats["total_edges"]),
            ("Исследователей без связей (изолированные)", stats["isolated_authors"]),
            ("Среднее число совместных публикаций на связь", stats["avg_collaborations_per_edge"]),
            ("Наибольшее число совместных публикаций у пары", stats["max_collaborations"]),
            ("Плотность сети (Network Density)", stats["density"]),
            ("Число компонент связности", stats["connected_components"]),
        ]

        self.table_stats.setRowCount(len(items))
        for row_idx, (k, v) in enumerate(items):
            it_k = QTableWidgetItem(str(k))
            it_v = QTableWidgetItem(str(v))
            it_v.setFont(QFont("Segoe UI", 10, QFont.Bold))
            self.table_stats.setItem(row_idx, 0, it_k)
            self.table_stats.setItem(row_idx, 1, it_v)

    def _on_export_dialog(self):
        if self.current_graph.number_of_nodes() == 0:
            QMessageBox.information(self, "Внимание", "Нет данных для экспорта.")
            return

        folder = QFileDialog.getExistingDirectory(self, "Выберите папку для сохранения результатов")
        if not folder:
            return

        try:
            # 1. Матрица XLSX и CSV
            export_matrix_to_xlsx(self.adjacency_matrix_df, os.path.join(folder, "матрица_смежности.xlsx"))
            export_matrix_to_csv(self.adjacency_matrix_df, os.path.join(folder, "матрица_смежности.csv"))
            # 2. Авторы
            export_authors_to_xlsx(self.current_graph, os.path.join(folder, "список_исследователей.xlsx"))
            # 3. Связи
            export_edges_to_xlsx(self.current_graph, os.path.join(folder, "таблица_связей_соавторства.xlsx"))
            # 4. Статистика
            export_statistics_to_xlsx(self.current_stats, os.path.join(folder, "статистика_сети.xlsx"))
            # 5. Граф PNG
            export_graph_image_png(self.figure, os.path.join(folder, "граф_соавторства.png"), dpi=300)

            QMessageBox.information(
                self,
                "Экспорт завершен",
                f"Все 6 файлов успешно экспортированы в папку:\n{folder}"
            )
        except ExportError as e:
            QMessageBox.critical(self, "Ошибка экспорта", str(e))

    def _export_single(self, export_type: str):
        if self.adjacency_matrix_df.empty:
            QMessageBox.information(self, "Внимание", "Матрица пуста.")
            return

        if export_type == "matrix_xlsx":
            p, _ = QFileDialog.getSaveFileName(self, "Сохранить матрицу", "матрица_смежности.xlsx", "Excel (*.xlsx)")
            if p:
                export_matrix_to_xlsx(self.adjacency_matrix_df, p)
                QMessageBox.information(self, "Успех", f"Матрица сохранена в {p}")
        elif export_type == "matrix_csv":
            p, _ = QFileDialog.getSaveFileName(self, "Сохранить матрицу", "матрица_смежности.csv", "CSV (*.csv)")
            if p:
                export_matrix_to_csv(self.adjacency_matrix_df, p)
                QMessageBox.information(self, "Успех", f"Матрица сохранена в {p}")
