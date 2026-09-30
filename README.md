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
