import { decodeMapIcon } from './editor-map-icons.mjs?v=20261110-part2';
import { paintTilePreview } from './editor-map-graphics.mjs?v=20261110-part2';

export function paintEntityPortrait(canvas, result) {
  const image = result?.image, ctx = canvas.getContext?.('2d');
  if (!ctx?.createImageData || !ctx.putImageData || !image
    || !Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width > 512 || image.height > 512
    || image.pixels?.length !== image.width * image.height * 4) return false;
  const bounds = result.bounds ?? { x: 0, y: 0, width: image.width, height: image.height };
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger)
    || bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1
    || bounds.x + bounds.width > image.width || bounds.y + bounds.height > image.height) return false;
  canvas.width = bounds.width; canvas.height = bounds.height;
  const pixels = ctx.createImageData(image.width, image.height);
  pixels.data.set(image.pixels); ctx.putImageData(pixels, -bounds.x, -bounds.y);
  canvas.hidden = false;
  return true;
}

// Only the verified session's decoded KOM.PAC bank and existing portrait reader
// are used. Roster references and unknown hero identities never get a guessed face.
export function createEntityArtwork(host) {
  function appearanceFor(reference, model) {
    if (reference?.kind === 'deployment') return model.deployments?.find(row => row.recordIndex === reference.recordIndex) ?? reference;
    if (reference?.kind === 'reinforcement') {
      const row = model.reinforcements?.find(row => row.recordIndex === reference.recordIndex);
      return row?.templates?.find(item => item.byteOffset === row.templateOffset) ?? reference;
    }
    return reference ?? {};
  }
  return {
    append(container, reference, { pilot = true } = {}) {
      const model = host.model(), appearance = appearanceFor(reference, model);
      const art = document.createElement('span'); art.className = 'entity-art'; art.setAttribute('aria-hidden', 'true');
      const unit = model.units?.find(row => row.recordIndex === (appearance.displayUnitId??appearance.unitId));
      const faction = appearance.appearanceSource==='rom-default-roster'?'player':appearance.factionSource === 'ca02-group-selector'
        && ['player', 'enemy', 'other'].includes(appearance.faction) ? appearance.faction : 'unknown';
      const pixels = unit && decodeMapIcon(model.mapIcons, unit.mapIcon, faction);
      if (pixels?.some((value, index) => index % 4 === 3 && value !== 0)) {
        const icon = document.createElement('canvas'); icon.className = 'entity-unit-icon';
        icon.dataset.unitId = String(unit.recordIndex); icon.dataset.faction = faction;
        icon.title = `${unit.name || '기체'} · KOM.PAC 아이콘`;
        if (paintTilePreview(icon, pixels)) art.append(icon);
      }
      if(!unit&&appearance.placementKind==='sortie-position'){
        const slot=document.createElement('span');slot.className='entity-sortie-slot';slot.textContent='출격';
        slot.title='선택 출격 위치 · 기체와 파일럿은 게임의 세이브 편성에서 결정됩니다.';art.append(slot);
      }
      const pilotRow = pilot && Number.isInteger(appearance.pilotId) && appearance.pilotId > 0
        && ![302, 303].includes(appearance.pilotId) ? host.pilot?.(appearance.pilotId) : null;
      const token = host.session();
      if (pilotRow && pilotRow.recordKind !== 'hero-slot' && token) {
        const face = document.createElement('canvas'); face.className = 'entity-pilot-portrait'; face.hidden = true;
        face.dataset.pilotId = String(appearance.pilotId); face.title = `${pilotRow.name || appearance.pilotName || '파일럿'} 초상화`;
        art.append(face);
        Promise.resolve().then(() => host.session() === token && face.isConnected !== false
          ? host.portrait?.(pilotRow.previewIndex ?? pilotRow.recordIndex) : null).then(result => {
          if (host.session() !== token || face.isConnected === false) return;
          if (!paintEntityPortrait(face, result)) face.remove();
          if (!art.children.length) art.remove();
        }).catch(() => { face.remove(); if (!art.children.length) art.remove(); });
      }
      if (art.children.length) container.append(art);
      return art;
    },
  };
}
