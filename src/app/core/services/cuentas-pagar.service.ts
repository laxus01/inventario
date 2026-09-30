import { Injectable, inject } from '@angular/core';
import { AbonoPagar, CuentaPagar } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class CuentasPagarService {
  private readonly sqlite = inject(SqliteService);

  crear(compraId: number, proveedorId: number, total: number, concepto?: string): Promise<number> {
    return this.sqlite.addCuentaPagar({
      compra_id: compraId,
      proveedor_id: proveedorId,
      total,
      concepto: concepto ?? null,
    });
  }

  async listar(fecha?: string | null, usuarioId?: number | null): Promise<CuentaPagar[]> {
    return this.sqlite.getCuentasPagar(fecha, usuarioId);
  }

  saldo(cuenta: CuentaPagar): number {
    return cuenta.total - (cuenta.abonado ?? 0);
  }

  async totalPorPagar(fecha?: string | null, usuarioId?: number | null): Promise<number> {
    const cuentas = await this.listar(fecha, usuarioId);
    return cuentas.reduce((suma, c) => suma + this.saldo(c), 0);
  }

  pagos(cuentaId: number): Promise<AbonoPagar[]> {
    return this.sqlite.getPagosPagar(cuentaId);
  }

  async pagar(cuenta: CuentaPagar, valor: number): Promise<void> {
    if (!valor || valor <= 0) {
      throw new Error('El valor del pago debe ser mayor que cero');
    }
    if (valor > this.saldo(cuenta)) {
      throw new Error(`El pago excede el saldo: ${this.saldo(cuenta)}`);
    }
    await this.sqlite.addPagoPagar({ cuenta_id: cuenta.id!, valor });
  }

  /**
   * Elimina la cuenta (borrado lógico) solo si no tiene pagos registrados;
   * así no se pierde el historial de pagos realizados.
   */
  async eliminarCuenta(cuenta: CuentaPagar): Promise<void> {
    const pagos = await this.sqlite.getPagosPagar(cuenta.id!);
    if (pagos.length > 0) {
      throw new Error('La cuenta tiene pagos registrados; elimínalos primero');
    }
    await this.sqlite.eliminarCuentaPagar(cuenta.id!);
  }

  /** Elimina un pago (borrado lógico); el saldo de la cuenta vuelve a aumentar. */
  eliminarPago(pagoId: number): Promise<void> {
    return this.sqlite.eliminarPagoPagar(pagoId);
  }
}
