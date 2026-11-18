# Reluciente — Base de datos NoSQL para un comercio de artículos de limpieza

Proyecto integrador final — Bases de Datos III. MongoDB · replica set de 3 nodos · transacciones ACID · autorización con mínimo privilegio.

> Todos los datos de ejemplo (productos, ventas, clientes) son inventados.

---

## 1. Presentación

**Reluciente** es un comercio minorista de artículos de limpieza. El problema es doble: mantener un catálogo de productos muy heterogéneo y controlar el stock en tiempo real para atender rápido en el mostrador y no vender lo que no hay.

Los productos se organizan en siete familias: multiusos, desinfectantes, limpiadores específicos, detergentes, desengrasantes, limpiadores enzimáticos y utensilios y accesorios.

**Rol de la base de datos:** es el núcleo del sistema. Guarda el catálogo, el stock y los tickets de venta; la aplicación del mostrador la consulta en cada venta, por lo que tiene que ser rápida en lecturas, tolerar la caída de un servidor sin cortar la atención y mantener el stock consistente.

**Por qué NoSQL orientado a documentos:** los productos no comparten los mismos atributos. Un detergente a granel tiene `unidad_medida: "Litros"`, una escoba tiene `material`, un enzimático tiene un subdocumento `enzimas`, un desinfectante puede tener `certificaciones` o una `promocion`. En un modelo relacional esto exigiría muchas columnas nulas o tablas auxiliares; en un documento cada producto guarda solo lo que le corresponde, y se lee completo en una sola operación. Además, un ticket de venta se lee siempre junto con sus ítems, lo que encaja con documentos anidados.

---

## 2. Modelo de datos

Base de datos: `reluciente_db`. Colecciones:

| Colección | Tipo | Documentos | Rol |
|---|---|---|---|
| `productos` | **Principal** | 13 | Catálogo y stock |
| `ventas` | **Principal** | 11 | Tickets de venta |
| `categorias` | Auxiliar (referenciada) | 7 | Las 7 familias del dominio (son siete por definición del negocio) |
| `logs` | Técnica | se llena en la prueba de failover | Registros de la inserción continua (Sección 7) |

### `categorias`

```json
{
  "_id": { "$oid": "64a1b2c3d4e5f67890123457" },
  "nombre": "Detergentes",
  "descripcion": "Productos líquidos o en polvo para limpieza y lavado de vajilla o tejidos"
}
```

### `productos`

```json
{
  "_id": { "$oid": "64a1f9e8d4e5f67890987655" },
  "nombre": "Detergente Líquido Limón",
  "precio_por_unidad": 1200.00,
  "stock": 50,
  "categoria_id": { "$oid": "64a1b2c3d4e5f67890123457" },
  "detalles": { "tipo_venta": "Suelto", "unidad_medida": "Litros" }
}
```

### `ventas`

```json
{
  "_id": { "$oid": "64b2a0c1d4e5f678909a0003" },
  "numero_ticket": 1003,
  "fecha": { "$date": "2026-10-28T09:05:00Z" },
  "medio_pago": "Transferencia",
  "cliente": "Cliente Mostrador",
  "items": [
    { "producto_id": { "$oid": "64a1f9e8d4e5f67890987656" }, "nombre": "Multiuso Aroma Lavanda", "cantidad": 3, "precio_unitario": 950.0 },
    { "producto_id": { "$oid": "64a1f9e8d4e5f67890987658" }, "nombre": "Limpiavidrios Especial", "cantidad": 2, "precio_unitario": 890.0 }
  ],
  "total": 4630.0
}
```

### Anidar o referenciar

| Dato | Decisión | Justificación (patrón de acceso) |
|---|---|---|
| `productos.detalles` | **Anidado** | Cada vez que el vendedor busca un producto necesita ver cómo se vende (unidad o suelto, medida, material). Es un dato propio del producto, nunca se consulta solo y tiene pocos campos: se lee en una única lectura, sin uniones. |
| `productos.categoria_id` | **Referencia** | Una categoría agrupa muchos productos y su descripción cambia rara vez. Referenciarla evita repetir el texto en cada producto y permite corregirla en un solo documento. Patrón: listar productos de una categoría. |
| `ventas.items` | **Anidado** | Un ticket se imprime y se consulta siempre completo con sus ítems; los ítems no existen fuera de su venta y son pocos por ticket. Patrón: ver el detalle de un ticket. |
| `ventas.items.nombre` y `precio_unitario` | **Copia (snapshot)** | Si el precio del producto cambia mañana, el ticket histórico debe conservar lo que se cobró. Por eso se copian al momento de la venta. |
| `ventas.items.producto_id` | **Referencia** | Permite volver al producto (por ejemplo para reponer stock o ver ventas de un artículo). |

### Patrones de acceso (al menos uno por colección)

- `productos`: buscar por nombre en el mostrador; listar stock crítico; filtrar por forma de venta; recomendar por superficie.
- `categorias`: obtener la descripción de la familia de un producto vía `categoria_id`.
- `ventas`: ver el detalle de un ticket; ventas de importe alto para el cierre de caja; registrar una venta descontando stock (transacción, Sección 8).

### Variaciones de estructura justificadas por el negocio

En `scripts/data/productos.json` conviven documentos con estructuras distintas, aprovechando el esquema flexible:

- **Multiuso Aroma Lavanda**: lista `superficies_aptas` (3 elementos).
- **Lampazo con Mango**: lista `colores_disponibles` (2 elementos); **Detergente Líquido Ropa Color**: lista `fragancias` (3 elementos). Listas de distinto largo según el producto.
- **Limpiador Enzimático Manchas Orgánicas**: subdocumento `enzimas` que ningún otro producto tiene.
- **Desinfectante Cocina Bactericida**: `certificaciones` y `concentracion_activa` (propiedades opcionales por tratarse de un producto regulado).
- **Desinfectante Multisuperficie Aerosol**: subdocumento opcional `promocion`.
- **Desengrasante Industrial Cocina**: `advertencia_seguridad` solo en productos peligrosos.
- **Estropajo Doble Faz**: `unidades_por_pack`; **Repuesto Cepillo Descontinuado**: `descontinuado: true`.
- En `ventas`: `cliente` aparece solo en algunos tickets, y `items` tiene entre 1 y 3 elementos.

---

## 3. Cambios en el modelo

Respecto del diseño inicial (Fase 1: `categorias` y `productos`):

1. **Se agregó la colección `ventas`** (Fase 3). La transacción ACID necesita un proceso que escriba en más de un documento: descontar stock en `productos` y crear el ticket. Los ítems van anidados por el patrón de acceso explicado arriba.
2. **Se agregó la colección técnica `logs`** para la prueba de inserción continua del failover.
3. La vigencia de la promoción del aerosol se actualizó a `2026-12-31` para que siga vigente en los datos de prueba.

La estructura de `productos` y `categorias` no cambió.

---

## 4. Arquitectura

![Arquitectura del replica set](docs/img/arquitectura.svg)

La aplicación (scripts de `mongosh`) se conecta con una cadena que lista **los tres nodos** y el nombre del replica set, usando el usuario `reluciente_app`. El driver descubre quién es el primario y, si cae, redirige las escrituras al nuevo primario sin que cambie la cadena de conexión.

| Nodo | Puerto | Rol | Datos |
|---|---|---|---|
| Nodo 1 | 27017 | Primario (prioridad 2) | Sí |
| Nodo 2 | 27018 | Secundario (prioridad 1) | Sí (replica por oplog) |
| Nodo 3 | 27019 | Árbitro | No, solo vota |

Los tres nodos se autentican entre sí con un `keyFile` compartido.

---

## 5. Puesta en marcha

Requisitos: MongoDB Server 8.x (o 7.x), `mongosh` y las MongoDB Database Tools (`mongoimport`) en el `PATH`. Los comandos están pensados para **PowerShell** (en Linux/macOS se indican las diferencias al final).

Todo se ejecuta desde la **raíz del repositorio**.

```powershell
git clone https://github.com/TizianoCueito24/Reluciente.git
cd Reluciente
```

### 5.1 Carpetas y keyFile

El keyFile es un secreto: se genera localmente y está en `.gitignore`.

```powershell
mkdir data\nodo1, data\nodo2, data\arbitro, logs, keys
$bytes = New-Object byte[] 756
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes) | Set-Content -NoNewline keys\mongo.key
```

### 5.2 Levantar los tres nodos

Los archivos de `config/` activan `security.authorization: enabled` y `security.keyFile`. Cada comando abre un proceso en segundo plano:

```powershell
Start-Process mongod -ArgumentList "--config","config\mongod-27017.conf"
Start-Process mongod -ArgumentList "--config","config\mongod-27018.conf"
Start-Process mongod -ArgumentList "--config","config\mongod-27019.conf"
```

### 5.3 Iniciar el replica set y crear el administrador

Con autorización activa y sin usuarios, MongoDB permite hacer esto por `localhost` (excepción de localhost), una sola vez:

```powershell
mongosh --port 27017 --file scripts\iniciar-replica-set.js
mongosh --port 27017 --file scripts\crear-usuarios.js
```

`crear-usuarios.js` pide la clave del administrador `adminMaster` por consola (ejemplo de clave para pruebas: `Admin_Reluciente_2026`). Esperá unos segundos a que el nodo 1 sea `PRIMARY` (`rs.status()`).

### 5.4 Crear el usuario de aplicación

Autenticado como administrador, se crea `reluciente_app` con rol `readWrite` solo sobre `reluciente_db` (clave de ejemplo: `App_Reluciente_2026`):

```powershell
mongosh "mongodb://localhost:27017/admin?replicaSet=relucienteRS" -u adminMaster -p --file scripts\crear-usuario-app.js
```

### 5.5 Cargar los datos

Un JSON por colección en `scripts/data/`. `--drop` permite repetir la carga las veces que haga falta. Se usa el usuario de aplicación:

```powershell
$URI = "mongodb://reluciente_app:App_Reluciente_2026@localhost:27017,localhost:27018,localhost:27019/reluciente_db?replicaSet=relucienteRS&authSource=reluciente_db"
mongoimport --uri $URI --collection categorias --drop --jsonArray --file scripts\data\categorias.json
mongoimport --uri $URI --collection productos  --drop --jsonArray --file scripts\data\productos.json
mongoimport --uri $URI --collection ventas     --drop --jsonArray --file scripts\data\ventas.json
```

### 5.6 Ejecutar los scripts (siempre con el usuario de aplicación)

```powershell
$URI = "mongodb://localhost:27017,localhost:27018,localhost:27019/reluciente_db?replicaSet=relucienteRS&authSource=reluciente_db"
mongosh $URI -u reluciente_app -p App_Reluciente_2026 --file scripts\consultas.js
mongosh $URI -u reluciente_app -p App_Reluciente_2026 --file scripts\transaccion.js
```

La prueba de failover (Sección 7) usa una cadena con `serverSelectionTimeoutMS=30000`:

```powershell
$URIF = "$URI&serverSelectionTimeoutMS=30000"
mongosh $URIF -u reluciente_app -p App_Reluciente_2026 --file scripts\insercion-continua.js
```

> Las claves de este README son **valores de ejemplo**. No hay contraseñas ni keyFile en el repositorio (`.gitignore` excluye `keys/`, `data/` y `logs/`).

**Linux/macOS:** cambiar `\` por `/`, crear las carpetas con `mkdir -p`, generar la clave con `openssl rand -base64 756 > keys/mongo.key && chmod 600 keys/mongo.key` y lanzar cada nodo con `mongod --config config/mongod-27017.conf --fork` (idem 27018 y 27019).

---

## 6. Consultas MQL

Código completo y comentado en [`scripts/consultas.js`](scripts/consultas.js). Se ejecutaron con el usuario de aplicación contra el replica set.

### Lectura

**1. Coincidencia exacta** — *¿Cuánto cuesta y cuánto stock hay de un producto que el cliente nombra en el mostrador?*

```javascript
db.productos.find({ nombre: "Detergente Líquido Limón" })
```
![Consulta 1](docs/img/consulta-1-nombre.png)

**2. Comparación (`$lt`, `$gt`)** — *¿Qué productos tienen stock crítico y hay que reponer al proveedor?*

```javascript
db.productos.find({ stock: { $lt: 10 } })
db.ventas.find({ total: { $gt: 8000 } }, { numero_ticket: 1, total: 1, _id: 0 })   // ventas grandes para el cierre de caja
```
![Consulta 2](docs/img/consulta-2-stock.png)

**3. Propiedad anidada (notación de punto)** — *¿Qué productos se venden sueltos? Los necesita el área de fraccionamiento.*

```javascript
db.productos.find({ "detalles.tipo_venta": "Suelto" })
```
![Consulta 3](docs/img/consulta-3-suelto.png)

**4. Proyección sin `_id`** — *Lista liviana de precios y stock para imprimir en el mostrador.*

```javascript
db.productos.find({}, { nombre: 1, precio_por_unidad: 1, stock: 1, _id: 0 })
```
![Consulta 4](docs/img/consulta-4-proyeccion.png)

**5. Lista con `$all`** — *¿Qué producto sirve a la vez para vidrio y para piso? Para recomendarlo a un cliente.*

```javascript
db.productos.find({ superficies_aptas: { $all: ["Vidrio", "Piso"] } })
```
![Consulta 5](docs/img/consulta-5-superficies.png)

### Escritura

**6. `$set` (modifica un campo y agrega otro)** — *Ajuste de precio por inflación dejando registrada la fecha.*

```javascript
db.productos.updateOne(
  { nombre: "Escoba de Cerdas Duras" },
  { $set: { precio_por_unidad: 3800.00, ultima_actualizacion_precio: new Date() } }
)
```
![Consulta 6](docs/img/consulta-6-set.png)

**7. `$inc` (contador atómico)** — *Se vendieron 5 litros sueltos: se descuenta el stock sin leerlo antes (evita pisar ventas simultáneas).*

```javascript
db.productos.updateOne({ nombre: "Detergente Líquido Limón" }, { $inc: { stock: -5 } })
```
![Consulta 7](docs/img/consulta-7-inc.png)

**8. Eliminación segura** — *Dar de baja un producto descontinuado sin riesgo de borrar otro por error: se verifica con `countDocuments` antes de borrar.*

```javascript
const filtro = { nombre: "Repuesto Cepillo Descontinuado", stock: 0, descontinuado: true };
db.productos.countDocuments(filtro)   // debe dar 1
db.productos.deleteOne(filtro)
```
![Consulta 8](docs/img/consulta-8-delete.png)

---

## 7. Bitácora del failover

**Objetivo:** demostrar que el sistema sigue escribiendo cuando cae el primario.

Script: [`scripts/insercion-continua.js`](scripts/insercion-continua.js). Inserta un documento por segundo en `logs`, conectado a los tres nodos con el nombre del replica set, y muestra qué nodo es el primario en cada inserción.

Pasos:

1. Verificar el estado inicial del replica set (nodo 1 `PRIMARY`, nodo 2 `SECONDARY`, nodo 3 `ARBITER`).
   ![Estado inicial](docs/img/failover-1-estado-inicial.png)
   *Muestra los tres nodos y sus roles; demuestra que el replica set está sano antes de la prueba.*
2. Lanzar `insercion-continua.js` y ver las inserciones saliendo contra el primario `localhost:27017`.
   ![Inserciones iniciales](docs/img/failover-2-insertando.png)
3. Detener el proceso `mongod` del nodo 1 (primario) con la inserción en marcha:
   ```powershell
   Stop-Process -Id (Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%mongod-27017.conf%'").ProcessId -Force
   ```
   ![Caída del primario](docs/img/failover-3-caida.png)
   *Una inserción queda esperando mientras se hace la elección.*
4. El script continúa y aparece `CAMBIO DE PRIMARIO: localhost:27017 -> localhost:27018`.
   ![Nuevo primario](docs/img/failover-4-nuevo-primario.png)
   *Demuestra que el secundario fue elegido primario (con el voto del árbitro) y las escrituras siguieron sin cambiar la cadena de conexión.*
5. Estado final autenticado como administrador, con el nodo 1 caído: `db.hello()` informa `localhost:27018` como primario actual y la lista de procesos `mongod` en ejecución ya no incluye el nodo 1 (puerto 27017).
   ![Estado final](docs/img/failover-5-estado-final.png)
   *Demuestra que el replica set quedó con el nodo 2 como primario y el nodo 1 fuera de servicio.*
6. Volver a levantar el nodo 1 (`Start-Process mongod -ArgumentList "--config","config\mongod-27017.conf"`): se reincorpora como `SECONDARY` y se pone al día.

> **Por qué el primario nuevo se elige:** al caer el nodo 1 quedan 2 de 3 votos (secundario + árbitro), mayoría suficiente para elegir al nodo 2. Si además cayera el árbitro quedaría un solo voto de 3: no hay mayoría y el nodo 2 se queda como `SECONDARY` (solo lectura) hasta que vuelva otro nodo.

---

## 8. Transacción ACID

**Proceso crítico:** registrar una venta. Hay que descontar el stock de cada producto vendido **y** crear el ticket en `ventas`. Si una de las dos cosas falla, no puede quedar ninguna: sin la transacción podría quedar stock descontado sin ticket, o un ticket sin stock descontado.

Las transacciones multi-documento **necesitan un replica set** porque se apoyan en el oplog y en las sesiones del cluster; en un servidor standalone no existen. Se ejecuta con los tres nodos activos, porque la confirmación usa `writeConcern: { w: "majority" }` y con el primario caído y un árbitro no habría mayoría de nodos con datos.

Script: [`scripts/transaccion.js`](scripts/transaccion.js), comentado. Detalle clave: todas las operaciones usan la base **de la sesión** (`sesion.getDatabase(...)`); una operación hecha con `db` quedaría fuera de la transacción y no se revertiría.

```javascript
sesion.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
// por cada ítem: updateOne({ _id, stock: { $gte: cantidad } }, { $inc: { stock: -cantidad } })
//   si modifiedCount === 0  ->  throw new Error("Stock insuficiente ...")
// luego: ventas.insertOne({ ... })
sesion.commitTransaction();   // éxito
// catch: sesion.abortTransaction();   // fallo
```

**Escenario 1 — Éxito:** vende 2 lampazos y 3 estropajos. Se confirman los dos descuentos y el ticket 2001.

![Transacción: éxito](docs/img/transaccion-1-exito.png)
*Muestra el stock y la cantidad de ventas antes y después: el stock bajó 2 y 3 y hay una venta más. Demuestra que todas las operaciones se confirmaron juntas.*

**Escenario 2 — Fallo provocado:** pide 5 estropajos (válido, se descuenta dentro de la transacción) y 50 lampazos (no hay stock). La regla de negocio se viola a mitad del proceso, se ejecuta `abortTransaction()`.

![Transacción: fallo](docs/img/transaccion-2-fallo.png)
*Muestra que el stock de estropajos volvió al valor de antes y que no se creó ningún ticket. Demuestra el rollback: el descuento del primer ítem también se deshizo.*

---

## 9. Reporte de seguridad

- **Autorización obligatoria:** `security.authorization: enabled` en [`config/mongod-27017.conf`](config/mongod-27017.conf) (y en los otros dos nodos).
- **Autenticación entre nodos:** `security.keyFile: keys/mongo.key`, el mismo archivo en los tres nodos. El archivo no está en el repositorio.
- **Dos usuarios, mínimo privilegio:**

  | Usuario | Base | Rol | Uso |
  |---|---|---|---|
  | `adminMaster` | `admin` | `userAdminAnyDatabase`, `clusterAdmin` | Administrar usuarios y el cluster. **No** lo usa la aplicación. |
  | `reluciente_app` | `reluciente_db` | `readWrite` solo sobre `reluciente_db` | Consultas, transacción e inserción continua. |

- **Acceso anónimo rechazado:**

  ```powershell
  mongosh --port 27017
  ```
  ```javascript
  show dbs     // equivale a listDatabases -> MongoServerError[Unauthorized]: Command listDatabases requires authentication
  ```
  ![Acceso anónimo rechazado](docs/img/seguridad-1-anonimo.png)
  *Muestra que una conexión sin credenciales no puede ejecutar comandos. Demuestra que la autorización está activa.*

- **Usuario de aplicación limitado:** conectado como `reluciente_app`, puede leer y escribir en `reluciente_db` pero un comando de administración falla.

  ```javascript
  db.getSiblingDB("reluciente_db").productos.countDocuments()   // funciona
  db.getSiblingDB("admin").system.users.find()                  // Unauthorized
  ```
  ![Permisos de la app](docs/img/seguridad-2-app.png)

**Por qué ya no es vulnerable a los ataques a servidores expuestos sin autenticación:** los ataques masivos contra MongoDB (borrado o cifrado de la base con pedido de rescate) aprovecharon instalaciones con el puerto abierto a Internet y sin autenticación: cualquiera podía conectarse, listar y borrar. Con la autorización activa, un cliente anónimo no puede ejecutar ningún comando; los usuarios tienen solo los permisos que necesitan (si se filtra la clave de la aplicación no se pueden administrar usuarios ni otras bases); los nodos solo aceptan a otros nodos que presenten el keyFile; y `bindIp: 127.0.0.1` evita exponer los puertos a la red.

---

## 10. Conclusiones

**Aprendizajes**

- El modelo se decide por los patrones de acceso: anidar lo que se lee siempre junto (`detalles`, `items`) y referenciar lo compartido y de baja modificación (`categoria_id`).
- Un replica set con árbitro tolera la caída de un nodo con datos, pero no la de dos: la tolerancia depende de conservar la mayoría de votos.
- Las transacciones ACID dan consistencia a un proceso crítico, pero requieren replica set y que **todas** las operaciones pasen por la sesión.
- La seguridad es una configuración (autorización + keyFile + usuarios con mínimo privilegio), no algo que se agrega después.
- Se corrigió un error de la primera prueba de failover, que se conectaba a un solo nodo y no se recuperaba al caer el primario: había que usar la cadena de conexión del replica set completo.

**Mejoras posibles en una próxima versión**

- Índices sobre `productos.nombre`, `productos.categoria_id` y `ventas.fecha` (hoy solo existe el índice de `_id`).
- Validación de esquema (`$jsonSchema`) para exigir `nombre`, `precio_por_unidad` y `stock >= 0`.
- Un cuarto nodo con datos en lugar del árbitro, para tolerar mejor las fallas.
- Reportes con el framework de agregación (ventas por categoría y por día).
- Colección de proveedores y órdenes de reposición enlazadas al stock crítico.
- Una aplicación real (API o interfaz) sobre este modelo.
