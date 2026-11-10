// Directorio activo falso para pruebas: mismo contrato que src/h360/services/ldap.service.js#validarCredenciales.
const DN_ADMIN = 'CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local';

const errorDirectorio = (codigo) => Object.assign(new Error(codigo), { codigo });

/** `cuentas`: { usuario: { password, nombre, email, memberOf } }. 'caido' simula el AD sin responder. */
function crearDirectorioFalso(cuentas) {
  return {
    validarCredenciales: jest.fn(async (usuarioRaw, password) => {
      const u = String(usuarioRaw ?? '').trim().toLowerCase().replace(/^.*\\/, '').replace(/@.*$/, '');
      if (u === 'caido') throw errorDirectorio('AD_NO_DISPONIBLE');
      const c = cuentas[u];
      if (!c || !password || c.password !== password) throw errorDirectorio('CREDENCIALES_INVALIDAS');
      // El AD devuelve el sAMAccountName con su capitalización original.
      return { usuario: c.sam || u, nombre: c.nombre, email: c.email || '', memberOf: c.memberOf || [] };
    }),
  };
}

module.exports = { crearDirectorioFalso, DN_ADMIN };
