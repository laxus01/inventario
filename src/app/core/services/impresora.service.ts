import { Injectable, inject } from '@angular/core';
import { ThermalPrinter, bytesToBase64 } from '@devlas/capacitor-thermal-printer';
import { Capacitor } from '@capacitor/core';
import { ToastService } from './toast.service';

/** Línea del recibo lista para codificar en ESC/POS. */
export interface LineaReciboImpresion {
  nombre: string;
  cantidad: string;
  precio: string;
  subtotal: string;
}

export interface DatosRecibo {
  ventaId?: number;
  fecha?: string;
  lineas: LineaReciboImpresion[];
  total: string;
  metodo: string;
  metodoDetalle?: string[];
  nota?: string | null;
}

interface ImpresoraGuardada {
  address: string;
  name: string;
}

const CLAVE_IMPRESORA = 'impresora_bt';
/** Caracteres por línea de una impresora de 58 mm. */
const ANCHO = 32;

@Injectable({ providedIn: 'root' })
export class ImpresoraService {
  private readonly toast = inject(ToastService);

  impresoraGuardada(): ImpresoraGuardada | null {
    const cruda = localStorage.getItem(CLAVE_IMPRESORA);
    return cruda ? (JSON.parse(cruda) as ImpresoraGuardada) : null;
  }

  olvidarImpresora(): void {
    localStorage.removeItem(CLAVE_IMPRESORA);
  }

  /** Guarda la impresora elegida por el usuario para los próximos recibos. */
  async seleccionarImpresora(indice: number): Promise<ImpresoraGuardada | null> {
    const impresoras = await this.listarImpresoras();
    const elegida = impresoras[indice];
    if (!elegida) return null;
    localStorage.setItem(CLAVE_IMPRESORA, JSON.stringify(elegida));
    return elegida;
  }

  /** Impresoras Bluetooth emparejadas desde Ajustes del sistema. */
  async listarImpresoras(): Promise<ImpresoraGuardada[]> {
    if (!Capacitor.isNativePlatform()) {
      await this.toast.advertencia('La impresión solo está disponible en la app del celular');
      return [];
    }
    const { devices } = await ThermalPrinter.list({ transport: 'bluetooth' });
    return devices.map((d) => ({ address: d.address ?? '', name: d.name ?? d.address ?? '' }));
  }

  /**
   * Imprime el recibo. Si no hay impresora guardada devuelve null para que
   * la UI pida seleccionar una; si falla la impresión lanza el error.
   */
  async imprimir(datos: DatosRecibo): Promise<'sin-impresora' | 'impreso'> {
    const impresora = this.impresoraGuardada();
    if (!impresora) return 'sin-impresora';
    await this.enviar(impresora, datos);
    return 'impreso';
  }

  async enviar(impresora: ImpresoraGuardada, datos: DatosRecibo): Promise<void> {
    await ThermalPrinter.requestPermission({ transport: 'bluetooth', address: impresora.address });
    await ThermalPrinter.print({
      transport: 'bluetooth',
      address: impresora.address,
      data: bytesToBase64(this.codificarEscPos(datos)),
    });
  }

  /** Genera los bytes ESC/POS del ticket (texto ASCII, sin dependencias). */
  private codificarEscPos(datos: DatosRecibo): Uint8Array {
    const partes: number[] = [];
    const escribir = (texto: string) => {
      const limpio = this.aAscii(texto);
      for (let i = 0; i < limpio.length; i++) partes.push(limpio.charCodeAt(i));
    };
    const linea = (texto: string) => escribir(texto + '\n');
    const separador = () => linea('-'.repeat(ANCHO));

    // Init + centrado y negrita para el encabezado
    partes.push(0x1b, 0x40);
    partes.push(0x1b, 0x61, 0x01);
    partes.push(0x1b, 0x45, 0x01);
    linea('RECIBO DE VENTA');
    partes.push(0x1b, 0x45, 0x00);
    if (datos.ventaId != null) linea(`Venta #${datos.ventaId}`);
    if (datos.fecha) linea(datos.fecha);
    partes.push(0x1b, 0x61, 0x00);

    separador();
    for (const l of datos.lineas) {
      linea(this.dosColumnas(this.truncar(l.nombre, ANCHO), l.subtotal));
      linea(`  ${l.cantidad} x ${l.precio}`);
    }
    separador();
    partes.push(0x1b, 0x45, 0x01);
    linea(this.dosColumnas('TOTAL', datos.total));
    partes.push(0x1b, 0x45, 0x00);
    separador();

    linea(datos.metodo);
    for (const d of datos.metodoDetalle ?? []) linea(`  ${d}`);
    if (datos.nota) {
      separador();
      for (const trozo of this.ajustarTexto(datos.nota, ANCHO)) linea(trozo);
    }

    // Avance y corte de papel
    partes.push(0x1b, 0x64, 0x03);
    partes.push(0x1d, 0x56, 0x42, 0x00);
    return new Uint8Array(partes);
  }

  /** Texto en dos columnas: izquierda alineada, derecha pegada al borde. */
  private dosColumnas(izquierda: string, derecha: string): string {
    const espacio = ANCHO - izquierda.length - derecha.length;
    if (espacio < 1) return this.truncar(izquierda, ANCHO - derecha.length - 1) + ' ' + derecha;
    return izquierda + ' '.repeat(espacio) + derecha;
  }

  private truncar(texto: string, maximo: number): string {
    return texto.length > maximo ? texto.slice(0, maximo - 3) + '...' : texto;
  }

  /** Parte un texto largo en líneas de a lo sumo `ancho` caracteres. */
  private ajustarTexto(texto: string, ancho: number): string[] {
    const palabras = texto.split(/\s+/);
    const lineas: string[] = [];
    let actual = '';
    for (const palabra of palabras) {
      if ((actual + ' ' + palabra).trim().length > ancho) {
        if (actual) lineas.push(actual);
        actual = palabra;
      } else {
        actual = (actual + ' ' + palabra).trim();
      }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  /** Quita acentos y símbolos no imprimibles: los térmicos usan ASCII. */
  private aAscii(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e\n]/g, '');
  }
}
