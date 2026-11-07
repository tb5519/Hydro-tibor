import React from 'react';
import { useStore } from 'react-redux';
import { createIdeRuntime, setActiveIdeRuntime } from './runtime';
import { createIdeView } from './view';

export default function IdeRuntimeWindows() {
  const store = useStore();
  const mount = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!mount.current || !UiContext.ideRuntimeConnUrl) return undefined;
    const runtime = createIdeRuntime({
      url: UiContext.ideRuntimeConnUrl,
      source: () => {
        const value = store.getState() as any;
        return { code: value.editor.code || '', lang: value.editor.lang || '' };
      },
    });
    const view = createIdeView(mount.current, { onCommand: runtime.command });
    const unsubscribe = runtime.subscribe(view.render);
    setActiveIdeRuntime(runtime);
    return () => { unsubscribe(); view.dispose(); runtime.dispose(); };
  }, []);
  return <div ref={mount} className="ide-runtime-mount" />;
}
