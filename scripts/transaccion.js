// =====================================================================
// Reluciente - Transacción ACID multi-documento (Sección 8)
// Proceso crítico: registrar una venta = descontar stock de cada producto + crear el ticket en "ventas".
// O se hacen todas las operaciones o no se hace ninguna.
// Requiere replica set con los TRES nodos activos y el usuario de aplicación:
//   mongosh "mongodb://localhost:27017,localhost:27018,localhost:27019/reluciente_db?replicaSet=relucienteRS&authSource=reluciente_db" -u reluciente_app -p TU_CLAVE_APP --file scripts/transaccion.js
// =====================================================================
const rdb = db.getSiblingDB("reluciente_db");

function estado(titulo, nombres) {
  print("\n[" + titulo + "]");
  nombres.forEach(n => {
    const p = rdb.productos.findOne({ nombre: n }, { nombre: 1, stock: 1, _id: 0 });
    print("  stock " + n + ": " + p.stock);
  });
  print("  ventas registradas: " + rdb.ventas.countDocuments());
}

// items: [{ nombre, cantidad }]
function registrarVenta(items, medioPago, numeroTicket) {
  const sesion = db.getMongo().startSession();
  // IMPORTANTE: todas las operaciones usan la base DE LA SESIÓN; si usáramos rdb quedarían fuera de la transacción.
  const sdb = sesion.getDatabase("reluciente_db");
  sesion.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  try {
    const lineas = [];
    let total = 0;
    for (const it of items) {
      const prod = sdb.productos.findOne({ nombre: it.nombre });
      if (!prod) throw new Error("Producto inexistente: " + it.nombre);

      // Regla de negocio: no se puede vender más de lo que hay. El filtro stock >= cantidad lo garantiza.
      const r = sdb.productos.updateOne(
        { _id: prod._id, stock: { $gte: it.cantidad } },
        { $inc: { stock: -it.cantidad } }
      );
      if (r.modifiedCount === 0) {
        throw new Error("Stock insuficiente de '" + it.nombre + "' (pedido: " + it.cantidad + ", disponible: " + prod.stock + ")");
      }
      lineas.push({ producto_id: prod._id, nombre: prod.nombre, cantidad: it.cantidad, precio_unitario: prod.precio_por_unidad });
      total += it.cantidad * prod.precio_por_unidad;
    }

    sdb.ventas.insertOne({
      numero_ticket: numeroTicket,
      fecha: new Date(),
      medio_pago: medioPago,
      items: lineas,
      total: total
    });

    sesion.commitTransaction();
    print("COMMIT: venta " + numeroTicket + " confirmada. Total: $" + total);
  } catch (error) {
    sesion.abortTransaction();
    print("ABORT: " + error.message + " -> se deshizo todo, la base queda intacta.");
  } finally {
    sesion.endSession();
  }
}

const observados = ["Lampazo con Mango", "Estropajo Doble Faz"];

// Por defecto se corren los dos escenarios. Si se define `escenario` ("exito" o "fallo")
// antes de cargar este archivo, se corre solo ese.
const cual = (typeof escenario !== "undefined") ? escenario : "todos";

// ---------------- ESCENARIO 1: ÉXITO ----------------
if (cual === "todos" || cual === "exito") {
  print("=========== ESCENARIO 1: ÉXITO ===========");
  estado("ANTES", observados);
  registrarVenta([
    { nombre: "Lampazo con Mango", cantidad: 2 },
    { nombre: "Estropajo Doble Faz", cantidad: 3 }
  ], "Efectivo", 2001);
  estado("DESPUÉS", observados);
}

// ---------------- ESCENARIO 2: FALLO PROVOCADO ----------------
// El primer ítem es válido (descuenta stock dentro de la transacción) y el segundo pide más stock
// del que hay: la regla se viola a mitad del proceso y el descuento del primero se revierte.
if (cual === "todos" || cual === "fallo") {
  print("\n=========== ESCENARIO 2: FALLO PROVOCADO ===========");
  estado("ANTES", observados);
  registrarVenta([
    { nombre: "Estropajo Doble Faz", cantidad: 5 },
    { nombre: "Lampazo con Mango", cantidad: 50 }
  ], "Débito", 2002);
  estado("DESPUÉS", observados);
}
