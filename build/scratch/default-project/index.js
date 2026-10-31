// Use the classic Scratch Cat for new works while retaining localized project names.
import projectData from './project-data';
import cat from './cat.json';

/* eslint-disable import/no-unresolved */
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg';
import costume1 from '!raw-loader!./bcf454acf82e4504149f7ffe07081dbc.svg';
import costume2 from '!raw-loader!./0fb9be3e8397c983338cb71dc84d0b25.svg';
import meow from '!arraybuffer-loader!./83c36d806dc92327b9e7049a565c6bff.wav';
/* eslint-enable import/no-unresolved */
import {TextEncoder} from '../tw-text-encoder';

const defaultProject = translator => {
    const Encoder = typeof TextEncoder === 'undefined' ? require('text-encoding').TextEncoder : TextEncoder;
    const encoder = new Encoder();
    const project = projectData(translator);
    const sprite = project.targets.find(target => !target.isStage);
    sprite.costumes = cat.costumes.map(costume => ({...costume}));
    sprite.sounds = cat.sounds.map(sound => ({...sound}));

    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(project)
    }, {
        id: project.targets[0].costumes[0].assetId,
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, ...[costume1, costume2].map((costume, index) => ({
        id: cat.costumes[index].assetId,
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume)
    })), {
        id: cat.sounds[0].assetId,
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(meow)
    }];
};

export default defaultProject;
