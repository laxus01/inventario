import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, calendar, cash, checkmark, checkmarkCircleOutline, eye, eyeOff, fileTrayFullOutline, lockClosed, logIn, logOut, people, pencil, person, personAdd, personRemove, print, refresh, server, settingsOutline, swapVertical, sync, trash, trashOutline } from 'ionicons/icons';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { SqliteService } from './app/core/services/sqlite.service';
import { AuthService } from './app/core/services/auth.service';

defineJeepSqlite(window);
addIcons({ add, pencil, print, trash, 'person-add': personAdd, 'checkmark-circle-outline': checkmarkCircleOutline, 'person-remove': personRemove, 'trash-outline': trashOutline, 'swap-vertical': swapVertical, cash, 'log-in': logIn, 'log-out': logOut, server, checkmark, calendar, sync, refresh, eye, 'eye-off': eyeOff, person, 'settings-outline': settingsOutline, 'file-tray-full-outline': fileTrayFullOutline, 'lock-closed': lockClosed, people });

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideAppInitializer(() => {
      const sqlite = inject(SqliteService);
      const auth = inject(AuthService);
      return (async () => {
        await sqlite.initialize();
        await auth.asegurarAdmin();
      })();
    }),
  ],
});
