import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

const MATERIAL_PREFIX = 'ms:';

@Component({
  selector: 'app-icon',
  template: `
    @if (isMaterial()) {
      <span class="material-symbols-rounded">{{ materialName() }}</span>
    } @else {
      <ion-icon [name]="name()"></ion-icon>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .material-symbols-rounded {
        font-size: 1em;
        font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      }

      ion-icon {
        font-size: 1em;
      }
    `,
  ],
  imports: [IonIcon],
})
export class AppIconComponent {
  readonly name = input.required<string>();

  readonly isMaterial = computed(() => this.name().startsWith(MATERIAL_PREFIX));

  readonly materialName = computed(() =>
    this.isMaterial() ? this.name().slice(MATERIAL_PREFIX.length) : '',
  );
}
