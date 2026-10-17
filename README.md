# InventoryMovil

Aplicación móvil de inventario construida con Ionic + Angular y Capacitor.

## Requisitos previos

- Node.js (versión LTS recomendada)
- Android Studio (para compilar y ejecutar en Android)
- Java JDK configurado para Android (recomendado JDK 21)

## Instalación

```bash
npm install
```

## Ejecución en desarrollo (navegador)

```bash
npm start
```

Abre la aplicación en `http://localhost:4200` con recarga automática.

## Compilación para Android

Los comandos de compilación generan el build web, generan los assets de Capacitor, sincronizan la plataforma Android y abren Android Studio:

### Build de desarrollo

```bash
npm run build:android:dev
```

### Build de producción

```bash
npm run build:android:prod
```

Al finalizar, Android Studio se abre automáticamente. Desde ahí se puede ejecutar la app en un emulador o dispositivo físico (Run ▶).

## Compilación del APK con un solo comando

Estos comandos hacen todo el proceso en un solo paso: compilan la web, sincronizan Capacitor, generan el APK con Gradle y al terminar abren Android Studio automáticamente.

### APK de desarrollo (debug)

```bash
npm run apk:dev
```

El APK se genera en `android/app/build/outputs/apk/debug/app-debug.apk`.

### APK de producción (release)

```bash
npm run apk:prod
```

El APK se genera en `android/app/build/outputs/apk/release/app-release-unsigned.apk`.

> Nota: el APK de producción sale firmado con la configuración de firma del proyecto; si no hay un `keystore` configurado, se genera sin firmar y deberá firmarse antes de publicar en la Play Store.

## Otros comandos útiles

| Comando | Descripción |
| --- | --- |
| `npm run build` | Compila la aplicación web (Angular) |
| `npm test` | Ejecuta las pruebas unitarias |
| `npm run lint` | Ejecuta el linter |

## Fechas y zona horaria

Las marcas `created_at`, `updated_at` y `deleted_at` se almacenan y sincronizan en
UTC. Las pantallas, los recibos, las etiquetas Hoy/Ayer y los reportes usan la
zona horaria local del celular o del navegador. El equipo debe tener configurada
la zona correcta (para Colombia: `America/Bogota`, UTC-5).

Por ejemplo, `2026-10-17 00:30:00` en SQLite representa las 7:30 p. m. del
16 de octubre en Colombia y debe aparecer en los registros y reportes del dia 16.
Los filtros convierten cada dia local en un rango UTC, sin modificar las fechas
guardadas ni las marcas de sincronizacion.

Esta correccion no requiere migraciones ni actualizar registros existentes.
Para distribuirla, recompila y actualiza el cliente web o el APK; no requiere
cambios en el backend.

Pruebas de regresion de fechas (sin abrir ni modificar la base de datos), desde
PowerShell:

```powershell
$env:TZ = "America/Bogota"
npm test -- --watch=false --include="src/app/core/**/*.spec.ts"
```
