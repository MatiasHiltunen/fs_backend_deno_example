import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {

//  return c.text('Hello Hono!')

const clientLocale = c.req.header('Accept-Language') || 'en-US'

const title = clientLocale === 'fi-FI' ? 'Tiedoston Lataus Esimerkki' : 'File Upload Example'

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    h1 {
      color: #333;
    }
    form {
      margin-top: 20px;
    }
    input[type="file"] {
      margin-bottom: 10px;
    }
    button {
      padding: 10px 20px;
      background-color: #007BFF;
      color: white;
      border: none;
      cursor: pointer;
    }
    button:hover {
      background-color: #0056b3;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <form action="/upload" method="post" enctype="multipart/form-data">
    <input type="file" name="file" />
    <button type="submit">Upload</button>
  </form>

  <h2>Uploaded Files</h2>
  <ul id="uploaded-files"></ul>

  <script>
  
  async function fetchUploadedFiles() {

    const response = await fetch('/uploads');
    const files = await response.json();

    const uploadedFilesList = document.getElementById('uploaded-files');
    uploadedFilesList.innerHTML = '';

    files.forEach(file => {
        const listItem = document.createElement('li');
        const link = document.createElement('a');

        const img = document.createElement('img');
        img.src = '/uploads/' + file;
        img.alt = file;
        img.style.maxWidth = '500px';
        img.style.display = 'block';
        listItem.appendChild(img);

        link.href = '/uploads/' + file;
        link.textContent = file;
        listItem.appendChild(link);
        uploadedFilesList.appendChild(listItem);
    });
  }

  const form = document.querySelector('form');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();


      alert('File uploaded: ' + JSON.stringify(result));

      await fetchUploadedFiles();
    });

    fetchUploadedFiles();

  </script>
</body>
</html>`) 

})

app.post('/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return c.text('No file uploaded', 400)
  }

  const bytes = await file.bytes()

  await Deno.mkdir('./uploads', { recursive: true }) // Ensure the uploads directory exists

  await Deno.writeFile(`./uploads/${file.name}`, bytes, { create: true })
  // Here you can handle the uploaded file, e.g., save it to disk or process it
  // For demonstration, we'll just return the file name and size
  return c.json({
    filename: file.name,
    size: file.size,
    type: file.type,
  })
})

app.get('/uploads', async (c) => {
  const files: string[] = []

  for await (const dirEntry of Deno.readDir('./uploads')) {
    if (dirEntry.isFile) {
      files.push(dirEntry.name)
    }
  }
  return c.json(files)

})

app.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename')
  const filePath = `./uploads/${filename}`

  try {
    const file = await Deno.readFile(filePath)
  /*   const headers = new Headers() */
/*     headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    headers.set('Content-Type', 'application/octet-stream') */

    c.header('Content-Disposition', `attachment; filename="${filename}"`)
    c.header('Content-Type', 'application/octet-stream') 
    c.header('Content-Length', file.length.toString())


    return c.body(file, 200) 

  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return c.text('File not found', 404)
    }
    return c.text('Internal Server Error', 500)
  }
})


Deno.serve(app.fetch)
