import { Component, computed, input, model, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { PagoVenta, Venta, VentaDetalle } from '../../../models/inventario.models';
import { fechaHoraLocal } from '../../../core/utils/fechas';
import { FormatoEnteroPipe, FormatoValorPipe } from '../../pipes/formato-valor.pipe';

@Component({
  selector: 'app-recibo-modal',
  templateUrl: './recibo-modal.component.html',
  styleUrls: ['./recibo-modal.component.scss'],
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    FormatoEnteroPipe,
    FormatoValorPipe,
  ],
})
export class ReciboModalComponent {
  readonly venta = input.required<Venta>();
  readonly detalles = input.required<VentaDetalle[]>();
  readonly pagos = input<PagoVenta[]>([]);
  readonly clienteNombre = input<string | null>(null);
  /** Parte a crédito de una venta mixta (se muestra junto a los pagos contado). */
  readonly credito = input(0);
  readonly abierto = model.required<boolean>();
  /** El padre decide cómo enviar el recibo a la impresora. */
  readonly imprimir = output<void>();

  readonly lineas = computed(() =>
    this.detalles().map((d) => ({
      nombre: d.producto_nombre,
      cantidad: d.cantidad,
      unidad: d.presentacion_nombre ?? null,
      precio: d.presentacion_factor ? d.precio_unitario / d.presentacion_factor : d.precio_unitario,
      subtotal: d.cantidad * (d.presentacion_factor ? d.precio_unitario / d.presentacion_factor : d.precio_unitario),
    })),
  );

  readonly metodoLabel = computed(() => {
    const metodo = this.venta().metodo_pago;
    if (metodo === 'transferencia') return 'Transferencia';
    if (metodo === 'efectivo') return 'Efectivo';
    if (metodo === 'mixto') return 'Mixto';
    return 'Crédito';
  });

  fecha(): string {
    return fechaHoraLocal(this.venta().created_at);
  }

  cerrar(): void {
    this.abierto.set(false);
  }
}
