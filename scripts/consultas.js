// =====================================================================
// Reluciente - Consultas MQL (Sección 6 del README)
// Se ejecuta contra el replica set con el USUARIO DE APLICACIÓN:
//   mongosh "mongodb://localhost:27017,localhost:27018,localhost:27019/reluciente_db?replicaSet=relucienteRS&authSource=reluciente_db" -u reluciente_app -p TU_CLAVE_APP --file scripts/consultas.js
// =====================================================================
const rdb = db.getSiblingDB("reluciente_db");

// ---------------------------------------------------------------------
// LECTURA
// ---------------------------------------------------------------------

// 1) Coincidencia exacta.
// Negocio: el vendedor tipea el nombre en el mostrador y necesita precio y stock de ese producto.
print("\n--- 1) Coincidencia exacta ---");
printjson(rdb.productos.find({ nombre: "Detergente Líquido Limón" }).toArray());

// 2) Operadores de comparación ($lt y $gt) sobre campos numéricos.
// Negocio: ¿qué productos tienen stock crítico (menos de 10) y hay que reponer al proveedor?
print("\n--- 2) Comparación: stock < 10 ---");
printjson(rdb.productos.find({ stock: { $lt: 10 } }).toArray());
// Variante con $gt: ventas grandes (total mayor a 8000) para revisar el cierre de caja.
printjson(rdb.ventas.find({ total: { $gt: 8000 } }, { numero_ticket: 1, total: 1, _id: 0 }).toArray());

// 3) Propiedad anidada con notación de punto.
// Negocio: ¿qué productos se venden sueltos (por litro)? Los necesita el área de fraccionamiento.
print("\n--- 3) Dot notation: detalles.tipo_venta ---");
printjson(rdb.productos.find({ "detalles.tipo_venta": "Suelto" }).toArray());

// 4) Proyección que excluye _id explícitamente.
// Negocio: lista liviana de nombre, precio y stock para imprimir en el mostrador.
print("\n--- 4) Proyección sin _id ---");
printjson(rdb.productos.find({}, { nombre: 1, precio_por_unidad: 1, stock: 1, _id: 0 }).toArray());

// 5) Elementos de una lista con $all.
// Negocio: recomendarle al cliente un multiuso apto tanto para vidrio como para piso.
print("\n--- 5) Lista con $all ---");
printjson(rdb.productos.find({ superficies_aptas: { $all: ["Vidrio", "Piso"] } }).toArray());

// ---------------------------------------------------------------------
// ESCRITURA
// ---------------------------------------------------------------------

// 6) $set: modifica un campo existente (precio_por_unidad) y agrega uno nuevo (ultima_actualizacion_precio).
// Negocio: ajuste de precio por inflación dejando registrada la fecha del cambio.
print("\n--- 6) $set ---");
printjson(rdb.productos.updateOne(
  { nombre: "Escoba de Cerdas Duras" },
  { $set: { precio_por_unidad: 3800.00, ultima_actualizacion_precio: new Date() } }
));
printjson(rdb.productos.findOne({ nombre: "Escoba de Cerdas Duras" }));

// 7) $inc: actualización atómica de un contador (stock).
// Negocio: se vendieron 5 litros sueltos en el mostrador y se descuentan sin leer antes el valor.
print("\n--- 7) $inc ---");
printjson(rdb.productos.updateOne(
  { nombre: "Detergente Líquido Limón" },
  { $inc: { stock: -5 } }
));
printjson(rdb.productos.findOne({ nombre: "Detergente Líquido Limón" }, { nombre: 1, stock: 1, _id: 0 }));

// 8) Eliminación segura: primero se verifica con countDocuments, recién después se borra.
// Negocio: dar de baja un producto descontinuado, exigiendo stock 0 y marca "descontinuado".
print("\n--- 8) deleteOne con verificación previa ---");
const filtroBaja = { nombre: "Repuesto Cepillo Descontinuado", stock: 0, descontinuado: true };
const cantidad = rdb.productos.countDocuments(filtroBaja);
print("Documentos que coinciden con el filtro: " + cantidad);
if (cantidad === 1) {
  printjson(rdb.productos.deleteOne(filtroBaja));
} else {
  print("No se borra nada: el filtro no devolvió exactamente 1 documento.");
}
