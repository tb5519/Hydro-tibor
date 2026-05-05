import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { confirm } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, loadReactRedux, pjax, request, tpl,
} from 'vj/utils';
import { openDB } from 'vj/utils/db';

class ProblemPageExtender {
  isExtended = false;
  inProgress = false;
  $content = $('.problem-content-container');
  $contentBound = this.$content.closest('.section');
  $scratchpadContainer = $('.scratchpad-container');

  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    // @ts-ignore
    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await delay(100);

    $('body').addClass('header--collapsed mode--scratchpad');
    await this.$scratchpadContainer
      .css({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      })
      .show()
      .transition({
        // @ts-ignore
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    $('.main > .row').hide();
    $('.footer').hide();
    $(window).scrollTop(0);
    window.document.body.style.overflow = 'hidden';

    this.inProgress = false;
    this.isExtended = true;
  }

  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;

    $(window).scrollTop(0);
    $('.main > .row').show();
    $('.footer').show();

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    $('body').removeClass('header--collapsed mode--scratchpad');

    await this.$scratchpadContainer
      .transition({
        // @ts-ignore
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$scratchpadContainer.hide();
    // @ts-ignore
    this.$content.transition({ opacity: 1 }, { duration: 100 });
    window.document.body.style.overflow = 'scroll';

    this.inProgress = false;
    this.isExtended = false;
  }

  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], async () => {
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId], UiContext.pdoc.title);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function loadReact() {
    if (reactLoaded) return;
    $('.loader-container').show();

    const { default: WebSocket } = await import('../components/socket');
    const { default: ScratchpadApp } = await import('../components/scratchpad');
    const { default: ScratchpadReducer } = await import('../components/scratchpad/reducers');
    const { Provider, store } = await loadReactRedux(ScratchpadReducer);

    // @ts-ignore
    window.store = store;
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.pretestConnUrl);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
    };

    renderReact = () => {
      const root = createRoot($('#scratchpad').get(0));
      root.render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
      );
      unmountReact = () => root.unmount();
    };
    reactLoaded = true;
    $('.loader-container').hide();
  }

  let progress = false;

  async function enterScratchpadMode() {
    if (progress) return;
    progress = true;
    await extender.extend();
    await loadReact();
    renderReact();
    await scratchpadFadeIn();
    progress = false;
  }

  async function leaveScratchpadMode() {
    if (progress) return;
    progress = true;
    await scratchpadFadeOut();
    $('.problem-content-container').append($('.problem-content'));
    await extender.collapse();
    unmountReact();
    progress = false;
  }

  async function loadObjective() {
    $('.outer-loader-container').show();
    document.documentElement.classList.add('objective-problem-mode');
    document.body.classList.add('objective-problem-mode');
    const ans = {};
    const pids = [];
    let cnt = 0;
    const reg = /\{\{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) \}\}/g;
    $('.problem-content .typo').children().each((i, e) => {
      if (e.tagName === 'PRE' && !e.children[0].className.includes('#input')) return;
      const questions = [];
      let q;
      while (q = reg.exec(e.textContent)) questions.push(q); // eslint-disable-line no-cond-assign
      for (const [info, type] of questions) {
        cnt++;
        const id = info.replace(/\{\{ (input|select|multiselect|textarea)\((\d+(-\d+)?)\) \}\}/, '$2');
        pids.push(id);
        $(e).addClass('objective-question-title').attr('data-objective-id', id);
        if (type === 'input') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} objective-free-answer medium-3" id="p${id}">
              <input type="text" name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}">
            </div>
          `));
        } else if (type === 'textarea') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} objective-free-answer medium-6" id="p${id}">
              <textarea name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}"></textarea>
            </div>
          `));
        } else {
          if ($(e).next()[0]?.tagName !== 'UL') {
            cnt--;
            return;
          }
          $(e).html($(e).html().replace(info, ''));
          $(e).next('ul').addClass(`objective-options objective-options--${type === 'select' ? 'single' : 'multi'}`);
          $(e).next('ul').children().each((j, ele) => {
            const letter = String.fromCharCode(65 + j);
            $(ele).after(tpl`
              <label class="objective_${id} radiobox objective-option" id="p${id}">
                <input type="${type === 'select' ? 'radio' : 'checkbox'}" name="${id}" class="objective-input" value="${letter}">
                <span class="objective-choice-body">
                  <span class="objective-choice-letter">${letter}</span>
                  <span class="objective-choice-text">${{ templateRaw: true, html: ele.innerHTML }}</span>
                </span>
              </label>
            `);
            $(ele).remove();
          });
        }
      }
    });

    let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
    if (UiContext.tdoc?._id && UiContext.tdoc.rule !== 'homework') cacheKey += `@${UiContext.tdoc._id}`;

    let setUpdate;
    const db = await openDB;
    async function saveAns() {
      await db.put('solutions', {
        id: `${cacheKey}#objective`,
        value: JSON.stringify(ans),
      });
    }
    async function clearAns() {
      if (!(await confirm(i18n('All changes will be lost. Are you sure to clear all answers?')))) return;
      await db.delete('solutions', `${cacheKey}#objective`);
      window.location.reload();
    }

    function ProblemNavigation() {
      [, setUpdate] = React.useState(0);
      const update = React.useCallback(() => { setUpdate?.((v) => v + 1); }, []);
      React.useEffect(() => {
        $(document).on('click', update);
        $(document).on('input', update);
        return () => {
          $(document).off('click', update);
          $(document).off('input', update);
        };
      }, [update]);
      return <>
        <div className="objective-nav-card">
          <div className="objective-nav-title">答题卡</div>
          <div className="contest-problems objective-nav-grid">
            {pids.map((i) => <a href={`#p${i}`} key={i} className={ans[i] ? 'pending objective-nav-item is-answered' : 'objective-nav-item'}>
            <span className="id">{i}</span>
            </a>)}
          </div>
          <div className="objective-nav-legend">
            <span><i className="objective-nav-dot objective-nav-dot--answered" /> 已答</span>
            <span><i className="objective-nav-dot" /> 未答</span>
          </div>
        </div>
        <li className="menu__item">
          <button className="menu__link" onClick={clearAns}>
            <span className="icon icon-erase" /> {i18n('Clear answers')}
          </button>
        </li>
      </>;
    }

    async function loadAns() {
      const saved = await db.get('solutions', `${cacheKey}#objective`);
      if (typeof saved?.value !== 'string') return;
      const isValidOption = (v) => v.length === 1 && v.charCodeAt(0) >= 65 && v.charCodeAt(0) <= 90;
      Object.assign(ans, JSON.parse(saved?.value || '{}'));
      for (const [id, val] of Object.entries(ans)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (isValidOption(v)) $(`.objective_${id} input[value="${v}"]`).prop('checked', true);
          }
        } else if (val) {
          $(`.objective_${id} input[type=text], .objective_${id} textarea`).val(val.toString());
          if (isValidOption(val)) $(`.objective_${id}.radiobox [value="${val}"]`).prop('checked', true);
        }
      }
      setUpdate?.((v) => v + 1);
    }

    function setAnswer(name: string, value: string | string[]) {
      if (Array.isArray(value)) {
        if (value.length) ans[name] = value;
        else delete ans[name];
      } else if (value) ans[name] = value;
      else delete ans[name];
      setUpdate?.((v) => v + 1);
    }

    if (cnt) {
      await loadAns();
      $('.problem-content .typo').append(document.getElementsByClassName('nav__item--round').length
        ? `<input type="submit" disabled class="button rounded primary disabled" value="${i18n('Login to Submit')}" />`
        : `<input type="submit" class="button rounded primary" value="${i18n('Submit')}" />`);
      $('.objective-input[type!=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        setAnswer(e.target.name, e.target.value);
        saveAns();
      });
      $('input.objective-input[type=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        const current = Array.isArray(ans[e.target.name]) ? ans[e.target.name] : [];
        if (e.target.checked) {
          setAnswer(e.target.name, [...new Set([...current, e.target.value])].sort((a: string, b: string) => a.charCodeAt(0) - b.charCodeAt(0)));
        } else {
          setAnswer(e.target.name, current.filter((v) => v !== e.target.value));
        }
        saveAns();
      });
      $('input[type="submit"]').on('click', (e) => {
        e.preventDefault();
        request
          .post(UiContext.postSubmitUrl, {
            lang: '_',
            code: yaml.dump(ans),
          })
          .then((res) => {
            window.location.href = res.url;
          })
          .catch((err) => {
            Notification.error(err.message);
          });
      });
    }
    if (!document.getElementById('problem-navigation')) {
      const ele = document.createElement('div');
      ele.id = 'problem-navigation';
      $('.section--problem-sidebar ol.menu').prepend(ele);
      createRoot(document.getElementById('problem-navigation')).render(<ProblemNavigation />);
    }
    $('.non-scratchpad--hide').hide();
    $('.scratchpad--hide').hide();
    $('.outer-loader-container').hide();
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[data-lang]', (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', ev.currentTarget.dataset.lang);
    $('[data-lang]').removeClass('tab--active');
    pjax.request({ url: url.toString() });
    $(ev.currentTarget).addClass('tab--active');
  });
  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download"]').on('click', handleClickDownloadProblem);
  if (UiContext.pdoc.config?.type === 'objective') {
    loadObjective();
    $(document).on('vjContentNew', loadObjective);
  }
});

export default page;
