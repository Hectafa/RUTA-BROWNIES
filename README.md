# Ruta de Brownies

App para el celular que agenda las entregas de brownies a cada negocio, recuerda cuántos se dejaron y cuándo,
avisa cada mañana qué negocios toca visitar y muestra cuáles venden más.

Los datos se guardan en el propio celular; no necesita internet ni cuenta.

## Qué hace

- **Ruta:** negocios ordenados por urgencia (atrasados, hoy, próximos 3 días, al día).
- **Registrar entrega:** fecha y cuántos brownies se dejaron de cada tipo: **Normal, Sin azúcar y Proteína**.
  Solo se aceptan números enteros de 0 o más, y al menos un brownie en total. Opcionalmente, los sobrantes de
  la entrega anterior por tipo (para calcular ventas).
- **Negocios:** dirección, encargado, teléfono, notas y cada cuántos días se entrega (15 por defecto).
- **Estadísticas** de los últimos **7, 15 o 30 días, o Todo**: piezas entregadas y vendidas por tipo de brownie
  y por negocio, porcentaje de venta y piezas por mes.
- **Modo claro y oscuro:** botón de luna/sol arriba a la derecha. La app recuerda tu elección.
- **Recordatorio de cada mañana:** botón de la campana arriba a la derecha. Eliges la hora y llega una notificación:
  - el día que toca la entrega y cada día que siga atrasada;
  - **5 días antes**, para preparar los brownies, con lo que se dejó la última vez en ese negocio como referencia.
  Si un día coinciden, van en el mismo aviso. Si no hay nada, no llega aviso.
  Los avisos se programan en el celular para los próximos 30 días y se recalculan cada vez que registras algo o abres la app,
  así que si dejas de abrirla más de un mes, ábrela una vez para renovarlos.

## Android: obtener el APK sin instalar nada en tu computadora

1. Crea una cuenta en github.com (gratis) y un repositorio nuevo, por ejemplo `ruta-brownies`.
2. Sube el contenido de esta carpeta al repositorio (botón **Add file → Upload files**, arrastra todos los archivos y carpetas).
3. Revisa que exista el archivo `.github/workflows/android.yml` en el repositorio. Algunos navegadores no suben carpetas que
   empiezan con punto; si no aparece, usa **Add file → Create new file**, escribe ese nombre exacto y pega el contenido del archivo.
4. Ve a la pestaña **Actions**. La compilación arranca sola; tarda unos 5 minutos.
5. Cuando termine, ve a **Releases → Ruta de Brownies (última versión)** desde tu celular Android y descarga `ruta-brownies.apk`.
6. Ábrelo. Android pedirá permitir "instalar apps de origen desconocido" para tu navegador; acéptalo e instala.
7. Al abrir la app, acepta el permiso de notificaciones. En la campana puedes tocar **Probar notificación**.

Si en algún celular el aviso llega unos minutos tarde, en la campana aparece un botón para permitir alarmas exactas.
Algunas marcas (Xiaomi, Huawei, Oppo) cierran apps en segundo plano: en Ajustes → Batería, pon la app como "Sin restricciones".

Cada vez que subas un cambio al repositorio se genera un APK nuevo en el mismo enlace. Instalarlo encima conserva tus datos.

## iPhone

Apple solo permite instalar apps compiladas en una Mac con Xcode:

```bash
npm install
npx cap add ios
npm run sync
npx cap open ios
```

En Xcode, en **Signing & Capabilities** elige tu Apple ID como equipo, conecta el iPhone y pulsa ▶.
Con un Apple ID gratuito la app deja de abrir a los 7 días y hay que volver a instalarla desde Xcode;
con la cuenta de Apple Developer (99 USD al año) dura un año y se puede distribuir por TestFlight.

## Para desarrollar

```bash
npm install
npm test          # prueba la lógica de recordatorios
npx cap add android   # solo la primera vez (necesita Android Studio)
npm run sync          # compila src/ → www/app.js y lo copia a android/ e ios/
npx cap open android
```

- `src/core.js`: fechas, estado de cada negocio, tipos de brownie, validación, ventas, estadísticas y plan de recordatorios (sin dependencias).
- `test/`: pruebas de recordatorios y de entregas/estadísticas (`npm test`, también corren en cada compilación).
- `src/app.js`: pantallas, guardado en el celular (`@capacitor/preferences`) y notificaciones (`@capacitor/local-notifications`).
- `www/`: `index.html` y `style.css`.
