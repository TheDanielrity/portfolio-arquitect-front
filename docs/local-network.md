# Acceso de desarrollo desde un teléfono

## Modelos 3D y CORS de R2

El visor muestra el progreso comunicado por model-viewer. Se eliminó el corte
fijo de 60 segundos: un avance real renueva la espera de 2 minutos, con un máximo
total de 5 minutos por intento. Eventos repetidos o inválidos no renuevan la espera.
La descarga finalizada no se considera éxito hasta recibir el evento `load`.
Este ajuste evita cancelar descargas lentas en móvil, pero no garantiza que un
modelo complejo quepa en la memoria gráfica del dispositivo. La comprobación
en el Galaxy A35 físico queda pendiente del usuario.

La comprobación real del GLB confirmó que R2 responde HTTP 200 para ambos
orígenes, pero devuelve `Access-Control-Allow-Origin: http://localhost:4200`
solamente para localhost. Para `http://192.168.18.5:4200` ese encabezado falta.
El visor necesita leer el GLB mediante una petición con CORS; que una imagen
se muestre mediante `<img>` no demuestra que el almacenamiento permita esa lectura.

Cambio necesario en almacenamiento: en Cloudflare → R2 → bucket que contiene
los modelos → Settings → CORS policy, añadir `http://192.168.18.5:4200` a
`AllowedOrigins` de la regla existente que permite GET y HEAD. Conservar los
orígenes actuales de desarrollo y producción, así como los métodos, encabezados
y exposición de ETag utilizados por las subidas PUT. No reemplazar toda la
política por una regla de ejemplo ni utilizar `*` como origen.

Este permiso permite al navegador de ese origen leer los objetos autorizados;
no cambia permisos del bucket ni sustituye la autorización de las URLs firmadas.
No requiere cambios de FastAPI, PostgreSQL, geometría ni volver a subir modelos.
La configuración remota no se ha modificado desde este repositorio.

Después de guardar, recargar la página del teléfono y comprobar que la respuesta
del GLB incluye `Access-Control-Allow-Origin: http://192.168.18.5:4200`.
Si cambia la IP o el puerto del servidor, actualizar también el origen permitido.
La comprobación previa de imágenes del script LAN no valida CORS del visor 3D.

## Servidor y entrega de imágenes

El script npm start usa actualmente `ng serve --host 0.0.0.0`, según la
configuración elegida por el usuario. Escuchar en 0.0.0.0 no autoriza todos los
hosts en Angular SSR. El dev-server sobrescribe la lista de hosts del build,
por lo que los hosts de desarrollo se declaran en
`angular.json → serve → configurations → development → allowedHosts`.

Se permiten localhost, 127.0.0.1 y la IP indicada en la captura del usuario:
192.168.18.5. No se utiliza un wildcard ni se desactiva la protección de hosts.
Si cambia la IP del PC, actualizar ese valor. Producción conserva su configuración
de hosts y la preparación de Railway existente.

Después de cambiar angular.json, detener el servidor propio con Ctrl+C y ejecutar
de nuevo `npm start`. Desde el teléfono, conectado a la misma red, abrir
`http://192.168.18.5:4200/`. 0.0.0.0 es una dirección de escucha, no la URL que
debe introducirse en el teléfono. No usar localhost desde el teléfono.

La configuración de desarrollo usa `/api/v1`; API_BASE_URL resuelve ese path con
el origen de la petición SSR o de document.location en navegador. Así las llamadas
del teléfono pasan por el proxy Angular al backend local y no apuntan al propio
teléfono. Una URL absoluta explícita de API sigue teniendo prioridad. Si existe
la variable API_BASE_URL con una URL de localhost, revisarla para esta prueba LAN.
Los valores inválidos, URLs con credenciales y paths relativos ambiguos se rechazan.

No se cambiaron FastAPI, sus contratos, el firewall ni la configuración remota de
R2. Si una petición directa a R2 falla por CORS desde el teléfono, se debe revisar
por separado que su AllowedOrigins incluya el origen LAN exacto. Esta validación
no comprueba el firewall o la conectividad Wi-Fi del teléfono físico.

Las URLs de imágenes devueltas por el backend local pueden contener
`127.0.0.1:8000`. PublicCover y el logo del encabezado reutilizan PublicMediaDelivery
para servir los endpoints administrados `/api/v1/public/media/{uuid}/content`
desde el origen API configurado. Se aplica también a miniaturas. Las URLs
directas de CDN y las URLs firmadas con query no se reescriben. No se modifica
el asset ni su URL persistida; es una resolución de entrega en la presentación,
igual que la utilizada por el visor GLB existente.

Validación: 616 pruebas aprobadas, lint, formato, TypeScript y build de producción
correctos. `node scripts/validate-lan.mjs` crea un servidor temporal en otro puerto,
comprueba SSR y el proxy real `/api/v1/health` con Host localhost y 192.168.18.5,
y comprueba que un host no autorizado reciba un error 4xx. Resuelve y verifica
también el origen de API serializado en TransferState. Se comprueban además
las URLs de imágenes en HTML SSR y su descarga real mediante
el proxy y la redirección al almacenamiento para ambos hosts. El servidor temporal se
cierra en finally y el script no detiene ni utiliza el puerto 4200 del usuario.
