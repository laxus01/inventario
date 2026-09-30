import { Component, input } from '@angular/core';
import { IonBackButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-page-header',
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" text=""></ion-back-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
  `,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
}
