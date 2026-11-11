# Publicación de la demo

## Estado comprobado el 11 de noviembre de 2026

- El frontend dispone de un build Angular SSR y un gateway HTTP en Express.
- Existe configuración de Railway y un despliegue histórico documentado en
  [railway-staging.md](railway-staging.md).
- La URL histórica es https://frontend-production-02892.up.railway.app.
  Los intentos de verificación desde este entorno fallaron por conexión; esto
  no confirma que el servicio esté caído.
- La carpeta local no tenía repositorio Git ni un remoto configurado al comenzar
  esta preparación.
- No se ha publicado código nuevo ni se ha cambiado el hosting.

## Código como evidencia

Publicar únicamente el frontend en su repositorio correspondiente. `.gitignore`
excluye dependencias, artefactos, `.tools`, archivos `.env` y claves privadas.
Antes del primer commit, revisar los archivos que se van a incluir con
`git status --short` y `git diff --cached`. No usar `git add -f` para incluir
archivos locales excluidos.

El README del repositorio debe enlazar la demo verificada e incluir capturas
aprobadas, funcionalidades, arquitectura e instrucciones de ejecución.
No publicar credenciales de administración ni contenido privado como evidencia.

## Hosting

Se eligió Netlify + Render. La configuración y el procedimiento vigentes están
en [netlify-render.md](netlify-render.md). Railway se conserva como entorno previo
hasta validar la migración; las alternativas de abajo documentan la revisión inicial.

Conservar Railway permite reutilizar el servidor SSR y el gateway existentes.
La configuración y las comprobaciones están en `railway-staging.md`.

Si se elige Netlify + Render, validar primero la adaptación SSR y el gateway:
el middleware de `src/server.ts` no debe darse por ejecutado automáticamente
en el runtime Angular de Netlify. La aplicación utiliza actualmente el gateway
del mismo origen para la entrega de medios. Una migración requiere comprobar
esa entrega, autenticación, rutas directas y uploads R2, además de configurar
los nuevos orígenes autorizados del backend y del bucket.

No cambiar el backend ni sus credenciales como parte de la preparación del
repositorio frontend. No marcar fases de `PLANS.md` como completadas por publicar
una demo.

## Datos pendientes

- URL del repositorio GitHub que recibirá este frontend.
- Elección entre conservar Railway o migrar a Netlify + Render.
- Verificación del servicio y del contenido público antes de compartir la demo.
