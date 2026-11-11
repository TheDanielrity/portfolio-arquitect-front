// Phase 11 extension of the real, anonymous Phase 10 browser harness.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function detailSmoke({
  request,
  upload,
  projects,
  asset,
  prefix,
  filename,
  base,
  origin,
  evaluate,
  send,
  navigate,
  until,
  capture,
  publicRequests,
}) {
  async function load(slug) {
    await navigate('/projects/' + slug);
    await until(
      "!!document.querySelector('app-project-detail article') || !!document.querySelector('app-project-detail .status [role=alert]')",
    );
  }
  // Browser-produced video exercises genuine playback rather than a fake MIME header.
  const videoBytes = await evaluate(
    `(async()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;document.body.append(canvas);const context=canvas.getContext('2d');context.fillStyle='#ac3c29';context.fillRect(0,0,32,32);const stream=canvas.captureStream(10);const parts=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});return await new Promise(resolve=>{let frame=0;const timer=setInterval(()=>{context.fillStyle=frame++%2?'#ac3c29':'#22241f';context.fillRect(0,0,32,32);},50);recorder.ondataavailable=event=>parts.push(event.data);recorder.onstop=async()=>{clearInterval(timer);stream.getTracks().forEach(track=>track.stop());canvas.remove();const bytes=new Uint8Array(await new Blob(parts).arrayBuffer());resolve(btoa(String.fromCharCode(...bytes)));};recorder.start();setTimeout(()=>recorder.stop(),1000);});})()`,
  );
  const video = await upload(
    filename.replace('.jpg', '.webm'),
    'video/webm',
    Buffer.from(videoBytes, 'base64'),
  );
  const positions = Buffer.alloc(36);
  [-1, 0, 0, 1, 0, 0, 0, 2, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const modelJson = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [
        {
          doubleSided: true,
          pbrMetallicRoughness: {
            baseColorFactor: [0.65, 0.25, 0.15, 1],
            metallicFactor: 0,
            roughnessFactor: 1,
          },
        },
      ],
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-1, 0, 0],
          max: [1, 2, 0],
        },
      ],
    }),
  );
  const padded = Buffer.alloc(Math.ceil(modelJson.length / 4) * 4, 32);
  modelJson.copy(padded);
  const glb = Buffer.alloc(28 + padded.length + positions.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  glb.writeUInt32LE(positions.length, 20 + padded.length);
  glb.writeUInt32LE(0x004e4942, 24 + padded.length);
  positions.copy(glb, 28 + padded.length);
  const model = await upload(filename.replace('.jpg', '.glb'), 'model/gltf-binary', glb);
  const image = await upload(
    filename.replace('.jpg', '-second.jpg'),
    'image/jpeg',
    await readFile(new URL('../public/images/foundation-study.jpg', import.meta.url)),
  );
  const project = projects[0];
  await request(
    'PATCH',
    '/admin/projects/' + project.id,
    {
      description: 'Phase 11 real architectural narrative.\nPlain text from FastAPI.',
      area_m2: '240.50',
      client_name: 'Temporary public client',
    },
    true,
  );
  for (const [label, value, sort_order] of [
    ['Material', 'Concrete', 2],
    ['Scale', '1:100', 1],
    ['Location duplicate', 'Temporary test content', 3],
  ]) {
    await request(
      'POST',
      '/admin/projects/' + project.id + '/attributes',
      { label, value, sort_order },
      true,
    );
  }
  const types = ['TEXT', 'IMAGE', 'GALLERY', 'VIDEO', 'MODEL_3D', 'QUOTE', 'SPLIT'];
  for (const [index, type] of types.entries()) {
    const media =
      type === 'TEXT' || type === 'QUOTE'
        ? []
        : type === 'GALLERY'
          ? [
              { media_id: asset.id, sort_order: 2, caption: 'Second gallery image' },
              { media_id: image.id, sort_order: 1, caption: 'First gallery image' },
            ]
          : [
              {
                media_id: type === 'VIDEO' ? video.id : type === 'MODEL_3D' ? model.id : image.id,
                sort_order: 0,
                caption: 'Real ' + type + ' caption',
              },
            ];
    await request(
      'POST',
      '/admin/projects/' + project.id + '/sections',
      {
        section_type: type,
        title: 'Public ' + type,
        content:
          type === 'TEXT'
            ? 'A narrative <strong>remains plain text</strong>.'
            : type === 'QUOTE'
              ? 'Architecture is a sequence of encounters.'
              : type === 'SPLIT'
                ? 'Image and narrative in dialogue.'
                : null,
        media,
        sort_order: index,
        is_visible: true,
      },
      true,
    );
  }
  await request(
    'POST',
    '/admin/projects/' + project.id + '/sections',
    {
      section_type: 'TEXT',
      title: 'Hidden section marker',
      content: 'Never expose this content.',
      sort_order: 0,
      is_visible: false,
    },
    true,
  );
  const contract = await request('GET', '/public/projects/' + project.slug);
  const discoverable = await request('GET', '/public/projects?limit=100');
  const currentIndex = discoverable.items.findIndex((item) => item.slug === project.slug);
  const successor = discoverable.items[(currentIndex + 1) % discoverable.items.length];
  assert.deepEqual(
    contract.sections.map((section) => section.section_type),
    types,
  );
  assert.deepEqual(
    contract.sections[2].media.map((media) => media.caption),
    ['First gallery image', 'Second gallery image'],
  );
  assert.ok(!JSON.stringify(contract).includes('Hidden section marker'));
  const html = await (await fetch(origin + '/projects/' + project.slug)).text();
  assert.ok(
    html.includes('Phase 11 real architectural narrative') &&
      html.includes('Architecture is a sequence of encounters.'),
  );
  assert.ok(!html.includes('Hidden section marker'));
  const productionHtml = await (
    await fetch('http://localhost:4303/projects/' + project.slug)
  ).text();
  assert.ok(
    productionHtml.includes('Phase 11 real architectural narrative') &&
      productionHtml.includes('Public MODEL_3D'),
  );
  assert.ok(!productionHtml.includes('<model-viewer'));
  for (const width of [1440, 1024, 768, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width === 375 ? 812 : 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    publicRequests.length = 0;
    await load(project.slug);
    await until("!!globalThis.ng?.getComponent(document.querySelector('app-project-detail'))");
    await until(
      "document.querySelector('.hero img')?.complete && document.querySelector('.hero img').naturalWidth>0",
    );
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
      'Detail horizontal overflow',
    );
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('app-project-section-renderer > section')].map(section=>section.className.split('section-')[1])",
      ),
      types.map((type) => type.toLowerCase()),
    );
    assert.equal(
      await evaluate("document.body.textContent.includes('Hidden section marker')"),
      false,
    );
    assert.equal(await evaluate("!!document.querySelector('.prose strong')"), false);
    assert.equal(
      await evaluate("!!document.querySelector('app-public-model .activate')"),
      false,
      'Automatic model loading must not require an activation button',
    );
    assert.ok(
      publicRequests.filter((path) => path === '/api/v1/public/projects/' + project.slug).length <=
        1,
      'Detail request duplicated during hydration',
    );
    assert.equal(
      await evaluate("document.querySelector('.next-project')?.getAttribute('href')"),
      '/projects/' + successor.slug,
    );
    await capture('detail-hero-' + width);
    await evaluate("document.querySelector('.facts').scrollIntoView()");
    await capture('detail-facts-' + width);
    await evaluate("document.querySelector('.section-gallery').scrollIntoView()");
    await capture('detail-gallery-' + width);
    await evaluate("document.querySelector('.section-split').scrollIntoView()");
    await capture('detail-split-' + width);
    console.log(
      'Real detail / seven sections / order / captions / SSR hydration / ' + width + 'px: OK',
    );
  }
  await evaluate(
    "document.querySelector('video').scrollIntoView();document.querySelector('video').loop=true;document.querySelector('video').play()",
  );
  try {
    await until(
      "document.querySelector('video').readyState>=2 && !document.querySelector('video').paused",
    );
  } catch {
    const state = await evaluate(
      "(()=>{const video=document.querySelector('video');return {present:!!video,ready:video?.readyState,paused:video?.paused,ended:video?.ended,time:video?.currentTime,duration:video?.duration,error:video?.error?.code,fallback:document.querySelector('.section-video').textContent.includes('could not be loaded')};})()",
    );
    throw new Error('Video fixture playback: ' + JSON.stringify(state));
  }
  await evaluate(
    "document.querySelector('video').pause();document.querySelector('app-public-model').addEventListener('error',event=>globalThis.modelFailureType=event.detail?.type,true);document.querySelector('app-public-model').scrollIntoView()",
  );
  try {
    await until("document.querySelector('model-viewer')?.loaded===true");
  } catch {
    const state = await evaluate(
      "(()=>{const component=ng.getComponent(document.querySelector('app-public-model'));return {active:component.active(),loading:component.loading(),failed:component.failed(),errorType:globalThis.modelFailureType,webgl:!!document.createElement('canvas').getContext('webgl2')};})()",
    );
    throw new Error('Model fixture load: ' + JSON.stringify(state));
  }
  await capture('detail-model-375');
  await evaluate("document.querySelector('model-viewer').dispatchEvent(new Event('error'))");
  await until(
    "document.querySelector('app-public-model').textContent.includes('Reintentar modelo 3D')",
  );
  await evaluate("document.querySelector('app-public-model button').click()");
  await until("document.querySelector('model-viewer')?.loaded===true");
  await evaluate("document.querySelector('video').dispatchEvent(new Event('error'))");
  await until(
    "document.querySelector('.section-video').textContent.includes('could not be loaded')",
  );
  await load(prefix + '-unlisted');
  assert.equal(
    await evaluate("document.querySelector('h1').textContent.includes('unlisted')"),
    true,
  );
  for (const suffix of ['draft', 'private', 'archived', 'deleted', 'nonexistent']) {
    const response = await fetch(base + '/public/projects/' + prefix + '-' + suffix);
    assert.equal(response.status, 404);
    await load(prefix + '-' + suffix);
    assert.equal(await evaluate("document.querySelector('h1').textContent"), 'Project not found.');
    assert.equal(await evaluate("!!document.querySelector('app-project-detail article')"), false);
  }
  await load(projects[1].slug);
  assert.equal(
    await evaluate("document.querySelectorAll('app-project-section-renderer').length"),
    0,
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.next-project app-public-cover')).transitionDuration",
    ),
    '0s',
  );
  await send('Emulation.setEmulatedMedia', { features: [] });
  console.log(
    'Real R2 video playback / GLB CORS and lazy viewer / media errors and retry / UNLISTED direct / inaccessible 404 / reduced motion: OK',
  );
}
