"""
Точка входа в настольное приложение 'Анализ научных связей'.
Запуск: python main.py
"""

import sys
import traceback
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtGui import QFont

from app.main_window import MainWindow


def exception_hook(exctype, value, tb):
    """
    Глобальный перехватчик исключений для вывода понятного диалогового окна на русском языке.
    """
    error_msg = "".join(traceback.format_exception(exctype, value, tb))
    print(f"Ошибка приложения:\n{error_msg}", file=sys.stderr)
    
    # Показываем аккуратное сообщение пользователю
    msg_box = QMessageBox()
    msg_box.setIcon(QMessageBox.Critical)
    msg_box.setWindowTitle("Произошла ошибка")
    msg_box.setText(f"Произошла непредвиденная ошибка в работе программы:\n{value}")
    msg_box.setDetailedText(error_msg)
    msg_box.exec()


def main():
    sys.excepthook = exception_hook

    app = QApplication(sys.argv)
    app.setApplicationName("Анализ научных связей")
    app.setOrganizationName("ПетрГУ_КарНЦ")

    # Устанавливаем аккуратный системный шрифт
    font = QFont("Segoe UI", 9)
    app.setFont(font)

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
