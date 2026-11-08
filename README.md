# Mi bolsillo — Finanzas personales

Prototipo web adaptable con cuentas de usuario, inicio con Google, registro por correo, saldo inicial y sincronización de datos entre dispositivos. Usa Supabase Auth y PostgreSQL; Netlify solo publica los archivos estáticos.

## Archivos importantes

- `index.html`, `styles.css`, `app.js`: interfaz y lógica de la aplicación.
- `supabase-config.js`: URL y publishable key pública del proyecto Supabase.
- `supabase/schema.sql`: tablas, perfil automático al crear cuenta, restricciones y políticas RLS.

## Preparar Supabase

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, crea una consulta nueva, copia el contenido de `supabase/schema.sql` y pulsa **Run**. Esto crea `profiles`, `transactions`, `budgets` y políticas para que cada usuario solo pueda leer o modificar sus propias filas.
3. En **Connect** del proyecto, copia la **Project URL** y la **Publishable key**.
4. Reemplaza los valores de `supabase-config.js`:

   ```js
   window.MI_BOLSILLO_CONFIG = {
     SUPABASE_URL: "https://tu-project-ref.supabase.co",
     SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
   };
   ```

   La publishable key está pensada para usarse en el navegador. **No coloques una `secret` key ni una `service_role` key en este archivo.** La separación entre cuentas la aplican las políticas RLS de la base de datos.

## Configurar Google

1. En Google Cloud, crea un OAuth Client ID de tipo **Web application**.
2. En **Authorized JavaScript origins**, agrega el origen local `http://localhost:8000` y la URL pública de Netlify, por ejemplo `https://mi-bolsillo.netlify.app`.
3. En **Authorized redirect URIs**, agrega el callback que muestra Supabase en **Authentication → Sign In / Providers → Google**. Suele tener el formato `https://<project-ref>.supabase.co/auth/v1/callback`.
4. En Supabase, habilita el proveedor Google y pega allí el Client ID y el Client Secret. El Client Secret se queda en Supabase; no va en los archivos publicados.
5. En **Authentication → URL Configuration**, establece la URL de Netlify como **Site URL** y agrega como **Redirect URLs** la URL local y la de Netlify, por ejemplo `http://localhost:8000/**` y `https://mi-bolsillo.netlify.app/**`.

Si Google inicia una cuenta nueva, la aplicación pedirá un nombre de usuario y el saldo inicial. En el registro por correo se piden nombre completo, correo, nombre de usuario y contraseña; si Supabase requiere confirmar el correo, confirma el mensaje y luego inicia sesión para completar el saldo inicial.

El ingreso con contraseña utiliza el correo electrónico. El nombre de usuario identifica el perfil y se solicita durante el primer acceso con Google.

## Abrir localmente y publicar

1. Ejecuta en esta carpeta `py -m http.server 8000` (o `python -m http.server 8000`).
2. Abre `http://localhost:8000`.
3. Cuando Supabase y Google estén configurados, arrastra esta carpeta completa a Netlify Drop. Al modificar archivos, vuelve a desplegar la carpeta actualizada.

## Datos y seguridad

El saldo disponible se calcula como `saldo inicial + ingresos − gastos`. Los movimientos, presupuestos y perfiles se almacenan en Supabase y quedan asociados a la cuenta autenticada. Si cada persona usa su propia cuenta, podrá consultar sus datos desde otros dispositivos después de iniciar sesión. No se conecta con bancos.
