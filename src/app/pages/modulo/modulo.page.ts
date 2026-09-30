import { Component, computed, input } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { MODULES } from '../../core/constants/modules';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-modulo',
  templateUrl: './modulo.page.html',
  imports: [IonContent, PageHeaderComponent, EmptyStateComponent],
})
export class ModuloPage {
  readonly id = input.required<string>();

  readonly module = computed(() => MODULES.find((m) => m.id === this.id()));
}
