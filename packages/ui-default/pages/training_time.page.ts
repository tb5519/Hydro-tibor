import $ from 'jquery';
import { bindTrainingTime } from '../components/training_time';
import { AutoloadPage } from '../misc/Page';

let binding: ReturnType<typeof bindTrainingTime>;

export default new AutoloadPage('trainingTime', () => {
  binding?.dispose();
  $(document).off('.trainingTime');
  if (!UiContext.trainingTime?.enabled && document.documentElement.dataset.page !== 'daily_quiz') return;
  binding = bindTrainingTime(UiContext.trainingTime || null);
  $(document).on('vjContentRemove.trainingTime', (event) => {
    if (event.target instanceof Element) binding.contentRemoved(event.target);
  });
});
