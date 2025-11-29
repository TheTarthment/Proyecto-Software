// backend/servidor.js

const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv'); 

dotenv.config();

// --- CONFIGURACIÓN DE LA BASE DE DATOS Y PUERTO ---
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "sistema_reservas"
};
const PORT = process.env.PORT || 3001;
const ADMIN_SECRET_KEY = process.env.ADMIN_KEY; 

const conexion = mysql.createConnection(dbConfig);

conexion.connect(err => {
  if (err) {
    console.error('❌ Error al conectar a la DB. Asegúrese que MySQL esté corriendo y las credenciales sean correctas:', err.stack);
    return;
  }
  console.log(`✅ Backend conectado a la DB. Servidor de la API en http://localhost:${PORT}`);
});

// Middlewares
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ---------------------- ENDPOINTS ----------------------

// Endpoint para REGISTRO de usuarios
app.post('/usuarios', (req, res) => {
  const { nombre, correo, contraseña, rol, claveAdmin } = req.body;

  if (rol === "Administrador") {
    // Implementación: Clave especial para registrar un administrador
    if (claveAdmin !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Clave de administrador incorrecta. No puedes registrar este rol.' });
    }
  }
  
  if (!nombre || !correo || !contraseña || !rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: nombre, correo, contraseña, rol.' });
  }

  const sql = 'INSERT INTO usuario (nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?)';
  conexion.query(sql, [nombre, correo, contraseña, rol], (error, result) => {
    if (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ error: 'El correo ya está registrado.' });
        }
        console.error("Error al insertar usuario:", error);
        return res.status(500).json({ error: 'Error interno del servidor al crear usuario.' });
    }
    res.json({ success: true, id: result.insertId, message: 'Usuario registrado exitosamente.' });
  });
});


// Endpoint para INICIO DE SESIÓN
app.post('/login', (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) {
    return res.status(400).json({ error: "Faltan datos: correo y contraseña son obligatorios." });
  }
  
  const sql = 'SELECT id, nombre, correo, contraseña, rol FROM usuario WHERE correo = ?';
  conexion.query(sql, [correo], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas" }); 
    }
    
    const user = results[0];
    
    if (user.contraseña !== contraseña) {
        return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    res.json({ 
        success: true, 
        user: {
            id: user.id,
            nombre: user.nombre,
            correo: user.correo,
            rol: user.rol
        } 
    }); 
  });
});

// Endpoint para CREACIÓN de reservas
app.post('/reservas', (req, res) => {
  const { tipo, ubicacion, espacio, fecha, hora, motivo, usuario_id } = req.body;
  if (!tipo || !ubicacion || !espacio || !fecha || !hora || !usuario_id) {
    return res.status(400).send({ error: 'Faltan datos obligatorios para la reserva.' });
  }

  // Validación: Comprobar si el espacio ya está reservado a esa hora/fecha
  const checkSql = 'SELECT ID FROM reserva WHERE Espacio = ? AND fecha = ? AND hora = ?';
  conexion.query(checkSql, [espacio, fecha, hora], (checkErr, checkResults) => {
    if (checkErr) return res.status(500).send({ error: checkErr.message });
    
    if (checkResults.length > 0) {
      return res.status(409).send({ error: 'El espacio ya está reservado para esa fecha y hora.' });
    }

    // Si no está reservado, proceder a la inserción
    const insertSql = 'INSERT INTO reserva (tipo, ubicacion, Espacio, fecha, hora, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
    conexion.query(insertSql, [tipo, ubicacion, espacio, fecha, hora, motivo, usuario_id], (error, result) => {
      if (error) return res.status(500).send({ error: error.message });
      res.send({ success: true, id: result.insertId, message: 'Reserva creada exitosamente.' });
    });
  });
});

// Endpoint para obtener reservas de un usuario
app.get('/reservas-usuario/:usuario_id', (req, res) => {
  const usuario_id = req.params.usuario_id;
  const sql = `
    SELECT ID, tipo, ubicacion, Espacio, fecha, hora, motivo
    FROM reserva
    WHERE usuario_id = ?
    ORDER BY fecha DESC, hora
  `;
  conexion.query(sql, [usuario_id], (err, results) => {
    if (err) return res.status(500).send({ error: err.message });
    res.json(results);
  });
});

// Endpoint para obtener todas las reservas (Administrador)
app.get('/ver-reservas', (req, res) => {
  const sql = `
    SELECT r.ID, r.Espacio, r.ubicacion, r.fecha, r.hora, r.motivo,
           u.nombre as usuario_nombre, u.correo as usuario_correo
    FROM reserva r
    JOIN usuario u ON r.usuario_id = u.id
    ORDER BY r.fecha DESC, r.hora
  `;
  conexion.query(sql, (err, results) => {
    if (err) return res.status(500).send({ error: err.message });
    res.json(results);
  });
});

// Endpoint para ELIMINAR una reserva
app.delete('/reserva/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM reserva WHERE ID = ?';
  conexion.query(sql, [id], (err, result) => {
    if (err) return res.status(500).send({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).send({ error: 'Reserva no encontrada.' });
    }
    res.send({ success: true, message: 'Reserva eliminada exitosamente.' });
  });
});

// Inicio del servidor
app.listen(PORT, () => console.log(`Servidor Express escuchando en puerto ${PORT}`));


