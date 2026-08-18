Sistema de Gestión "Reluciente" - Artículos de Limpieza

**1. Definición del Dominio del Problema**
El sistema busca automatizar y organizar la administración de un comercio minorista enfocado en la venta de artículos de limpieza. El problema principal a resolver es la necesidad de gestionar un catálogo de productos dinámico y controlar el stock disponible de forma ágil para optimizar la atención al cliente en el mostrador.

Para organizar el inventario, el sistema clasificará los productos en las siguientes familias principales:

🟡​**Multiusos: Aptos para diversas superficies como encimeras, mesas y pisos, ideales para limpieza diaria.**

🟡​**Desinfectantes: Diseñados para eliminar bacterias y virus, recomendados en cocinas, baños y áreas que requieren higiene estricta.**

🟡​**Limpiadores específicos: Formulados para superficies concretas como vidrio, madera, alfombras o textiles.**

🟡​**Detergentes: Para ropa y tejidos, en forma líquida o en polvo, eliminando manchas y olores.**

🟡​**Desengrasantes: Eficaces contra grasa y aceite, especialmente en cocinas e industrias.**

🟡​**Limpiadores enzimáticos: Utilizan enzimas activas para descomponer manchas orgánicas complejas y neutralizar olores.**

🟡​**Utensilios y Accesorios: Artículos físicos complementarios para la aplicación de productos y remoción de suciedad, tales como lampazos, estropajos, esponjas y escobas.**

Rol de la base de datos: La base de datos NoSQL jugará un rol central al proveer una estructura flexible que permita almacenar productos con distintas características (volúmenes, tipos de presentación, etc.) sin las restricciones de un esquema rígido. Esto garantizará lecturas rápidas y eficientes del catálogo general al momento de registrar ventas o consultar disponibilidad.

**2. Esquema de las Colecciones**
Para priorizar la forma en que la aplicación consumirá los datos, se diseñaron dos colecciones principales: categorias y productos.

🔸Colección: categorías (Estructura Referenciada)
Almacena las familias principales detalladas en la definición del dominio.

Categoría: Utensilios y Accesorios
```json
{
    "_id": "ObjectId('64a1b2c3d4e5f67890123456')",
    "nombre": "Utensilios y Accesorios",
    "descripcion": "Artículos físicos complementarios comercializados por unidad"
  }
```
Categoria: Detergentes
```json
{
    "_id": "ObjectId('64a1b2c3d4e5f67890123457')",
    "nombre": "Detergentes",
    "descripcion": "Productos líquidos o en polvo para limpieza y lavado de vajilla o tejidos"
  }
```

🔸Colección: productos (Estructura Mixta: Anidada y Referenciada)
Concentra la información principal del artículo, integrando sus detalles específicos de comercialización (por litro o por unidad) en el mismo documento.

Producto: Escoba de Cerdas Duras -> Categoría: Utensilios y Accesorios.
```json
{
    "_id": "ObjectId('64a1f9e8d4e5f67890987654')",
    "nombre": "Escoba de Cerdas Duras", 
    "precio_por_unidad": 3500.00,
    "stock": 15,
    "categoria_id": "ObjectId('64a1b2c3d4e5f67890123456')",
    "detalles": {
      "tipo_venta": "Unidad",
      "material": "Plástico y cerdas sintéticas"
    }
```
Producto: Detergente Liquido Limon -> Categoría: Detergentes
```json
{
    "_id": "ObjectId('64a1f9e8d4e5f67890987655')",
    "nombre": "Detergente Líquido Limón",
    "precio_por_unidad": 1200.00,
    "stock": 50.0,
    "categoria_id": "ObjectId('64a1b2c3d4e5f67890123457')",
    "detalles": {
      "tipo_venta": "Suelto",
      "unidad_medida": "Litros"
    }
```
**3. Fundamentación de la Lógica No Relacional**
Las decisiones arquitectónicas tomadas para el modelado de los documentos se justifican estrictamente en los patrones de acceso y consultas (queries) proyectados para la aplicación:

​🔹​Anidamiento (Embedded Documents) para **detalles**:

Se optó por anidar las características operativas y el tipo de comercialización (ya sea formato por litro o por unidad) directamente dentro del documento de cada producto. En el día a día del negocio, el patrón de lectura más frecuente será un query de búsqueda en el catálogo **(ej. db.productos.find({ nombre: "Escoba" }))**. Al consultar un artículo, el operador necesita ver de forma inmediata cómo se comercializa. El anidamiento optimiza este acceso, logrando obtener toda la información técnica en una única lectura en disco, sin necesidad de procesar múltiples consultas o uniones complejas.

​🔹​Referencia (References) para **categoria_id**:

Se decidió separar la información de las categorías en su propia colección y vincularlas mediante el ID (categoria_id). El patrón de acceso para modificar la estructura de las categorías es bajo, pero la consistencia de los datos es clave. Si el comercio decide actualizar la descripción de una categoría, esta estrategia evita anomalías y redundancias innecesarias, permitiendo modificar el dato en un único documento maestro sin tener que recorrer y actualizar masivamente cientos de documentos asociados en la colección de productos.


