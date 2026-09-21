
// 1) Filtrado básico por coincidencia exacta.
db.productos.find({
  nombre: "Detergente Líquido Limón"
});


// 2) Operador de comparación ($lt) sobre un campo numérico.

db.productos.find({
  stock: { $lt: 10 }
});


// 3) Acceso a propiedad anidada con dot notation.
db.productos.find({
  "detalles.tipo_venta": "Suelto"
});


// 4) Proyección de campos específicos, excluyendo _id explícitamente.
db.productos.find(
  {},
  { nombre: 1, precio_por_unidad: 1, stock: 1, _id: 0 }
);


// 5) Filtro dentro de un arreglo usando $all.

db.productos.find({
  superficies_aptas: { $all: ["Vidrio", "Piso"] }
});



// ACTUALIZACIONES ATÓMICAS (UPDATE) Y BAJA (DELETE)

db.productos.updateOne(
  { nombre: "Escoba de Cerdas Duras" },
  { $set: { precio_por_unidad: 3800.00, ultima_actualizacion_precio: "2026-09-21" } }
);


// 2) $inc — incrementa/decrementa un contador numérico de forma atómica.

  { nombre: "Detergente Líquido Limón" },
  { $inc: { stock: -5 } }
);


// 3) deleteOne — eliminación segura bajo un criterio de filtrado estricto.

db.productos.deleteOne({
  nombre: "Repuesto Cepillo Descontinuado",
  stock: 0
});
