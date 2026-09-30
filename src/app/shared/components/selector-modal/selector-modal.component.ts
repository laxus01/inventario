import { Component, computed, input, model, output, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

export interface OpcionSelector {
  id: number;
  nombre: string;
  detalle?: string;
}

@Component({
  selector: 'app-selector-modal',
  templateUrl: './selector-modal.component.html',
  styleUrls: ['./selector-modal.component.scss'],
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    EmptyStateComponent,
  ],
})
export class SelectorModalComponent {
  readonly titulo = input.required<string>();
  readonly opciones = input.required<OpcionSelector[]>();
  readonly seleccionado = input<number | null>(null);
  readonly abierto = model.required<boolean>();
  readonly seleccion = output<number>();
  /** Muestra botones de editar/eliminar por opción (p. ej. clientes, proveedores). */
  readonly conAcciones = input(false);
  readonly editar = output<number>();
  readonly eliminar = output<number>();

  readonly busqueda = signal('');

  readonly filtradas = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.opciones();
    return this.opciones().filter((o) => o.nombre.toLowerCase().includes(q));
  });

  buscar(ev: CustomEvent): void {
    this.busqueda.set((ev.detail as { value?: string }).value ?? '');
  }

  elegir(id: number): void {
    this.seleccion.emit(id);
    this.abierto.set(false);
  }

  cerrar(): void {
    this.abierto.set(false);
  }
}
