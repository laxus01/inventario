import { Component, input, model } from '@angular/core';
import { IonInput } from '@ionic/angular';

/**
 * Input de valores monetarios/enteros.
 * - Muestra el valor con separadores de miles (ej. 1.250.000) y sin centavos.
 * - Solo acepta dígitos mientras el usuario escribe.
 * - Expone el valor limpio como entero mediante two-way binding [(valor)].
 */
@Component({
  selector: 'app-input-valor',
  template: `
    <ion-input
      [label]="label()"
      label-placement="floating"
      inputmode="numeric"
      type="text"
      [value]="formatear(valor())"
      (ionInput)="alEscribir($event)"
      (ionBlur)="alSalir($event)"
    ></ion-input>
  `,
  imports: [IonInput],
})
export class InputValorComponent {
  readonly label = input.required<string>();
  readonly valor = model<number | undefined>(undefined);

  private readonly formato = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  });

  formatear(valor: number | undefined | null): string {
    if (valor == null) return '';
    return this.formato.format(valor);
  }

  alEscribir(ev: CustomEvent): void {
    const texto = (ev.detail as { value?: string })?.value ?? '';
    const digitos = texto.replace(/\D/g, '');
    const entero = digitos ? parseInt(digitos, 10) : undefined;
    this.valor.set(entero);
    (ev.target as HTMLIonInputElement).value =
      entero != null ? this.formato.format(entero) : '';
  }

  alSalir(ev: CustomEvent): void {
    (ev.target as HTMLIonInputElement).value = this.formatear(this.valor());
  }
}
