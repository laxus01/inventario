import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AppModule } from '../../../core/constants/modules';
import { AppIconComponent } from '../app-icon/app-icon.component';

@Component({
  selector: 'app-module-button',
  templateUrl: './module-button.component.html',
  styleUrls: ['./module-button.component.scss'],
  imports: [AppIconComponent],
})
export class ModuleButtonComponent {
  readonly module = input.required<AppModule>();

  private readonly router = inject(Router);

  abrir(): void {
    this.router.navigateByUrl(this.module().ruta);
  }
}
