import { Injectable, inject } from '@angular/core';
import { AbonoCobrar, CuentaCobrar } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class CuentasCobrarService {
  private readonly sqlite = inject(SqliteService);

  crear(ventaId: number, clienteId: number, total: number, concepto?: string): Promise<number> {
    return this.sqlite.addCuentaCobrar({
      venta_id: ventaId,
      cliente_id: clienteId,
      total,
      concepto: concepto ?? null,
    });
  }

  async listar(fecha?: string | null, usuarioId?: number | null): Promise<CuentaCobrar[]> {
    return this.sqlite.getCuentasCobrar(fecha, usuarioId);
  }

  saldo(cuenta: CuentaCobrar): number {
    return cuenta.total - (cuenta.abonado ?? 0);
  }

  async totalPorCobrar(fecha?: string | null, usuarioId?: number | null): Promise<number> {
    const cuentas = await this.listar(fecha, usuarioId);
    return cuentas.reduce((suma, c) => suma + this.saldo(c), 0);
  }

  abonos(cuentaId: number): Promise<AbonoCobrar[]> {
    return this.sqlite.getAbonosCobrar(cuentaId);
  }

  async abonar(cuenta: CuentaCobrar, valor: number): Promise<void> {
    if (!valor || valor <= 0) {
      throw new Error('El valor del abono debe ser mayor que cero');
    }
    if (valor > this.saldo(cuenta)) {
      throw new Error(`El abono excede el saldo: ${this.saldo(cuenta)}`);
    }
    await this.sqlite.addAbonoCobrar({ cuenta_id: cuenta.id!, valor });
  }

  /**
   * Elimina la cuenta (borrado lógico) solo si no tiene abonos registrados;
   * así no se pierde el historial de pagos recibidos.
   */
  async eliminarCuenta(cuenta: CuentaCobrar): Promise<void> {
    const abonos = await this.sqlite.getAbonosCobrar(cuenta.id!);
    if (abonos.length > 0) {
      throw new Error('La cuenta tiene abonos registrados; elimínalos primero');
    }
    await this.sqlite.eliminarCuentaCobrar(cuenta.id!);
  }

  /** Elimina un abono (borrado lógico); el saldo de la cuenta vuelve a aumentar. */
  eliminarAbono(abonoId: number): Promise<void> {
    return this.sqlite.eliminarAbonoCobrar(abonoId);
  }
}
