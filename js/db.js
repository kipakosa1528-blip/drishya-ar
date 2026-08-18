// DB API client - communicates with server API & uploads directory

export async function getAllProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  return res.json();
}

export async function getProject(id) {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function saveProjectWithFiles({ id, name, client, notes, expiresAt, imageFile, videoFile, mindBuffer }) {
  const imageBase64 = await fileToBase64(imageFile);
  const videoBase64 = await fileToBase64(videoFile);
  const mindBase64  = bufferToBase64(mindBuffer);

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id, name, client, notes, expiresAt,
      imageBase64, videoBase64, mindBase64
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveProject(proj) {
  return proj;
}

export async function deleteProject(id) {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteFiles(id) {
  return deleteProject(id);
}

export async function getFiles(id) {
  return { imageBlob: null, videoBlob: null, mindBlob: null };
}

export async function saveFiles(id, files) {
  return files;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:application/octet-stream;base64,' + btoa(binary);
}
