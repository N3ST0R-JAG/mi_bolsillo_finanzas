# Mi bolsillo — Finanzas personales

Prototipo web adaptable para registrar ingresos y gastos, organizar presupuestos y revisar gráficos e historial en guaraníes.

## Abrir el prototipo

No necesita instalar dependencias. Para ejecutarlo desde una carpeta local:

1. Abre una terminal en esta carpeta.
2. Ejecuta `py -m http.server 8000` (si no tienes `py`, prueba `python -m http.server 8000`).
3. Abre `http://localhost:8000` en el navegador.

También puedes abrir `index.html` directamente, aunque un servidor local suele ofrecer un comportamiento más consistente para guardar datos.

## Funciones incluidas

- Registro de ingresos y gastos con descripción, monto entero en guaraníes, fecha, categoría y medio de pago.
- Saldo disponible calculado como ingresos acumulados menos gastos acumulados.
- Presupuestos mensuales por categoría, con avance y aviso visual al alcanzar o superar el límite.
- Gráfico mensual de ingresos y gastos, y gráfico de gastos por categoría.
- Historial con filtros por mes y tipo de movimiento.
- Diseño adaptable a pantallas de celular y computadora.
- Guardado automático en el almacenamiento local del navegador; los datos siguen allí al cerrar y volver a abrir ese navegador en el mismo dispositivo.

## Archivos fuente

- `index.html`: estructura y secciones de la aplicación.
- `styles.css`: diseño adaptable.
- `app.js`: formularios, cálculos, gráficos y almacenamiento local.

## Alcance del prototipo

Los datos se guardan únicamente en el navegador y dispositivo donde se registran; no hay cuentas, sincronización ni conexión con bancos. Cualquier persona con acceso al mismo perfil del navegador podría ver esos datos. Para un proyecto académico, esto permite practicar la persistencia local, pero no sustituye una solución con autenticación y almacenamiento protegido para uso real.
