import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('homework_main', () => {
  $('[name="filter-form"] select').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });

  const refreshCompletedOverflow = () => {
    $('[data-homework-completed-line]').each((_, line) => {
      const pills = $(line).find('[data-homework-completed-pills]')[0];
      if (!pills) return;
      $(line).toggleClass('is-overflowing', pills.scrollWidth > pills.clientWidth + 1);
    });
  };

  $('[data-homework-student-toggle], [data-homework-assignment-toggle]').on('click', function onToggle() {
    const $trigger = $(this);
    const expanded = $trigger.attr('aria-expanded') === 'true';
    const id = $trigger.attr('aria-controls');
    $trigger.attr('aria-expanded', String(!expanded));
    $(`#${id}`).prop('hidden', expanded);
    if (!expanded) requestAnimationFrame(refreshCompletedOverflow);
  });

  refreshCompletedOverflow();
  $(window).on('resize.homework-main', refreshCompletedOverflow);
});

export default page;
