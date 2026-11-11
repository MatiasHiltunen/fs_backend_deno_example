// Ensin kokeilemme editoria: se lisää sulkuparin ja sisentää Enterin jälkeen.
function roleLabel(role: string) {
  // Funktio saa roolin tekstinä ja palauttaa sen isoilla kirjaimilla.
  return role.toUpperCase()
}

// IntelliSense täydentää nimen. TypeScript näyttää myös arvon tyypin.
const version = Deno.version
console.log(roleLabel("viewer"), version.deno)
