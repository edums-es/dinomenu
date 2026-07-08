import ctypes
import os
from ctypes import wintypes


PRINTER_ENUM_LOCAL = 0x00000002
PRINTER_ENUM_CONNECTIONS = 0x00000004


class PRINTER_INFO_4(ctypes.Structure):
    _fields_ = [
        ("pPrinterName", wintypes.LPWSTR),
        ("pServerName", wintypes.LPWSTR),
        ("Attributes", wintypes.DWORD),
    ]


class DOC_INFO_1(ctypes.Structure):
    _fields_ = [
        ("pDocName", wintypes.LPWSTR),
        ("pOutputFile", wintypes.LPWSTR),
        ("pDatatype", wintypes.LPWSTR),
    ]


def _winspool():
    if os.name != "nt":
        raise RuntimeError("O agente de impressao funciona somente no Windows")
    spool = ctypes.WinDLL("winspool.drv", use_last_error=True)
    spool.EnumPrintersW.argtypes = [
        wintypes.DWORD,
        wintypes.LPWSTR,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.c_byte),
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(wintypes.DWORD),
    ]
    spool.EnumPrintersW.restype = wintypes.BOOL
    spool.GetDefaultPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    spool.GetDefaultPrinterW.restype = wintypes.BOOL
    spool.OpenPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p]
    spool.OpenPrinterW.restype = wintypes.BOOL
    spool.StartDocPrinterW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p]
    spool.StartDocPrinterW.restype = wintypes.DWORD
    spool.StartPagePrinter.argtypes = [wintypes.HANDLE]
    spool.StartPagePrinter.restype = wintypes.BOOL
    spool.WritePrinter.argtypes = [
        wintypes.HANDLE,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    ]
    spool.WritePrinter.restype = wintypes.BOOL
    spool.EndPagePrinter.argtypes = [wintypes.HANDLE]
    spool.EndPagePrinter.restype = wintypes.BOOL
    spool.EndDocPrinter.argtypes = [wintypes.HANDLE]
    spool.EndDocPrinter.restype = wintypes.BOOL
    spool.ClosePrinter.argtypes = [wintypes.HANDLE]
    spool.ClosePrinter.restype = wintypes.BOOL
    return spool


def list_printers():
    spool = _winspool()
    needed = wintypes.DWORD()
    returned = wintypes.DWORD()
    flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
    spool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
    if not needed.value:
        return []
    buffer = ctypes.create_string_buffer(needed.value)
    if not spool.EnumPrintersW(
        flags,
        None,
        4,
        ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)),
        needed.value,
        ctypes.byref(needed),
        ctypes.byref(returned),
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    records = ctypes.cast(buffer, ctypes.POINTER(PRINTER_INFO_4))
    return sorted({records[index].pPrinterName for index in range(returned.value) if records[index].pPrinterName})


def default_printer():
    spool = _winspool()
    size = wintypes.DWORD(0)
    spool.GetDefaultPrinterW(None, ctypes.byref(size))
    if not size.value:
        return ""
    buffer = ctypes.create_unicode_buffer(size.value)
    if not spool.GetDefaultPrinterW(buffer, ctypes.byref(size)):
        return ""
    return buffer.value


def print_raw(printer_name, data, document_name):
    if not printer_name:
        raise RuntimeError("Selecione uma impressora")
    spool = _winspool()
    handle = wintypes.HANDLE()
    if not spool.OpenPrinterW(printer_name, ctypes.byref(handle), None):
        raise ctypes.WinError(ctypes.get_last_error())
    started_doc = False
    started_page = False
    try:
        doc = DOC_INFO_1(document_name, None, "RAW")
        if not spool.StartDocPrinterW(handle, 1, ctypes.byref(doc)):
            raise ctypes.WinError(ctypes.get_last_error())
        started_doc = True
        if not spool.StartPagePrinter(handle):
            raise ctypes.WinError(ctypes.get_last_error())
        started_page = True
        written = wintypes.DWORD()
        buffer = ctypes.create_string_buffer(data)
        if not spool.WritePrinter(handle, buffer, len(data), ctypes.byref(written)):
            raise ctypes.WinError(ctypes.get_last_error())
        if written.value != len(data):
            raise RuntimeError(f"Windows enviou apenas {written.value} de {len(data)} bytes")
    finally:
        if started_page:
            spool.EndPagePrinter(handle)
        if started_doc:
            spool.EndDocPrinter(handle)
        spool.ClosePrinter(handle)
