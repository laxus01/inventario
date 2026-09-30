import { Component, input } from '@angular/core';
import { AppIconComponent } from '../app-icon/app-icon.component';

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty">
      <app-icon [name]="icono()" />
      <p>{{ mensaje() }}</p>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 48px 24px;
        text-align: center;

        app-icon {
          font-size: 56px;
          color: var(--ion-color-medium);
        }

        p {
          color: var(--ion-color-medium);
          margin: 0;
        }
      }
    `,
  ],
  imports: [AppIconComponent],
})
export class EmptyStateComponent {
  readonly icono = input('file-tray-full-outline');
  readonly mensaje = input.required<string>();
}
