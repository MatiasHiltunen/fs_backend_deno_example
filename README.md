# Deno + Prisma ORM + Hegel

Pieni Deno 2 -palvelin, joka listaa PostgreSQL-kannan käyttäjiä Prisma ORM 8:n
kautta. Käyttäjälistassa on validoitu sivutus ja Hegelillä kirjoitetut
ominaisuuspohjaiset testit.

## Käynnistä

Tarvitset Deno 2:n sekä Docker Composen tai oman PostgreSQL-kannan.

```sh
cp .env.example .env
deno install --frozen
docker compose up -d db
deno task db:init
deno task start
```

`db:init` alustaa uuden esimerkkikannan sopimuksen mukaiseksi. Käytä olemassa
olevan skeeman muutoksiin projektin migraatiokomentoja; älä alusta
tuotantokantaa tätä esimerkkiä varten. Ensimmäinen käyttäjähaku lisää kolme
esimerkkikäyttäjää idempotentilla upsertilla.

Palvelin kuuntelee oletuksena portissa **8000**. `.env`-tiedoston `PORT` vaihtaa
palvelimen portin. `PGHOST`, `PGUSER`, `PGPASSWORD` ja `PGDATABASE` ovat
pakollisia; `PGPORT` on oletuksena 5432. Sama yhteyskonfiguraatio on käytössä
sovelluksessa ja Prisma CLI:ssä. Salasanan ja tunnusten URL-erikoismerkit
enkoodataan automaattisesti.

Kun kanta on alustettu, myös sovelluksen voi käynnistää kontissa:

```sh
docker compose up --build deno
```

Compose käyttää samoja `.env`-muuttujia, mutta asettaa sovelluskontin
tietokannan osoitteeksi `db:5432`. Adminer on erikseen käynnistettävissä
komennolla `docker compose up -d adminer` ja osoitteessa
<http://localhost:8080>.

## Käyttäjien sivutus

```sh
curl 'http://localhost:8000/api/users?limit=2&offset=0'
curl 'http://localhost:8000/api/users?limit=2&offset=2'
```

Vastaus sisältää `users`-taulukon ja käytetyt sivutusarvot:

```json
{
  "users": [],
  "pagination": { "limit": 2, "offset": 2 }
}
```

Esimerkin tyhjä taulukko kuvaa vastausrakennetta; todellinen sisältö riippuu
kannasta.

| Parametri | Oletus | Sallitut arvot           |
| --------- | ------ | ------------------------ |
| `limit`   | 10     | kokonaisluku 1–100       |
| `offset`  | 0      | kokonaisluku 0–1 000 000 |

Parametrit annetaan tavallisina desimaalilukuina ilman etunollia. Tyhjä arvo,
desimaalimurto, eksponenttimuoto ja saman parametrin toistaminen palauttavat
400:n. Virheellinen pyyntö ei tee tietokantakyselyä. Käyttäjät järjestetään
yksikäsitteisen `id`-kentän mukaan, jolloin sivutus on toistettava
muuttumattomassa aineistossa. Rinnakkaiset lisäykset tai poistot voivat siirtää
offset-sivujen rajoja.

`GET /` toimii käyttäjälistan aliaksena. Tuntematon polku palauttaa 404:n ja muu
HTTP-metodi 405:n (`Allow: GET`). Tietokantavirhe palauttaa yleisen
500-vastauksen.

## Testaa Hegelillä

```sh
deno task build
deno task test
```

Tavalliset testit ja viisi Hegel-ominaisuutta toimivat ilman PostgreSQL:ää tai
`.env`-tiedostoa. Kukin ominaisuus käyttää 100 generoitua testitapausta:

- Hyväksytyt sivutusarvot välittyvät tietokantafunktiolle ja HTTP-vastaukseen.
- Virheelliset sivutusarvot ja toistuvat parametrit hylätään ennen
  tietokantakutsua.
- Tietokannan tunnukset, salasana ja nimi säilyvät URL:n muodostuksen ja
  purkamisen läpi myös erikoismerkeillä.
- Kelvottomat tietokantaportit hylätään.

`main_test.ts` kattaa alkuperäisen `main.ts`-HTTP-esimerkin. Sen tuominen ei
enää avaa tietokantayhteyttä. ORM-sovelluksen varsinainen käynnistyspiste on
`src/index.ts`.

### PostgreSQL-integraatiotesti

Aseta `.env` osoittamaan erilliseen testikantaan ja alusta se samalla
sopimuksella:

```sh
deno task db:init
deno task test:integration
```

Integraatiotesti käynnistää oikean HTTP-palvelimen satunnaiseen paikalliseen
porttiin. Hegel generoi 100 sivutuspyyntöä. PostgreSQL:stä saadun vastauksen
pitää vastata kaikkien käyttäjien muistissa järjestetyn taulukon
`slice(offset, offset + limit)` -tulosta. Testi sulkee palvelimen ja
tietokantapoolin myös epäonnistuessaan. GitHub Actions ajaa sekä tavalliset
testit että integraatiotestin erillisellä PostgreSQL-palvelulla.

Hegel käyttää natiivikirjastoa, joten testitehtävät antavat Denolle FFI-, luku-
ja ympäristöoikeudet. Hegelin testitietokanta on testeissä poistettu käytöstä.

Sopimuksen muuttamisen jälkeen generoi tyypit uudelleen:

```sh
deno task contract:emit
```

Lähteet: [Hegelin TypeScript-ohje](https://hegel.dev/typescript),
[Prisma ORM:n kyselyt](https://www.prisma.io/docs/orm/reference/orm-client),
[Denon npm-yhteensopivuus](https://docs.deno.com/runtime/fundamentals/node/).
