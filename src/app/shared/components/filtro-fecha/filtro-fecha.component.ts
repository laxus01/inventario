import { Component, input, model, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Usuario } from '../../../models/inventario.models';
import { etiquetaFecha, hoyIso } from '../../../core/utils/fechas';

@Component({
  selector: 'app-filtro-fecha',
  templateUrl: './filtro-fecha.component.html',
  styleUrls: ['./filtro-fecha.component.scss'],
  imports: [
    FormsModule,
    IonChip,
    IonIcon,
    IonLabel,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonDatetime,
    IonList,
    IonItem,
  ],
})
export class FiltroFechaComponent implements OnInit {
  readonly fecha = model<string | null>(null);
  readonly usuarioId = model<number | null>(null);
  readonly usuarios = input<Usuario[]>([]);

  calendarioAbierto = signal(false);
  fechaCalendario = '';
  usuariosAbierto = signal(false);

  ngOnInit(): void {
    console.log('[filtro-fecha] componente inicializado');
  }

  get hoyIso(): string {
    return hoyIso();
  }

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  etiquetaUsuario(): string {
    const id = this.usuarioId();
    if (id == null) return 'Todos los usuarios';
    return this.usuarios().find((u) => u.id === id)?.nombre ?? 'Usuario';
  }

  abrirCalendario(): void {
    this.fechaCalendario = this.fecha() ?? '';
    this.calendarioAbierto.set(true);
  }

  cerrarCalendario(): void {
    this.calendarioAbierto.set(false);
  }

  aplicarFecha(): void {
    const valor = this.fechaCalendario.slice(0, 10);
    this.fecha.set(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null);
    this.calendarioAbierto.set(false);
  }

  limpiarFiltro(): void {
    this.fecha.set(null);
  }

  abrirUsuarios(): void {
    this.usuariosAbierto.set(true);
  }

  cerrarUsuarios(): void {
    this.usuariosAbierto.set(false);
  }

  seleccionarUsuario(id: number | null): void {
    this.usuarioId.set(id);
    this.usuariosAbierto.set(false);
  }
}
