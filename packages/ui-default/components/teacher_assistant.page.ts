import { AutoloadPage } from 'vj/misc/Page';
import { installTeacherAssistant } from './teacher_assistant';

// Show the control before optional media/editor loaders wait on network requests.
export default new AutoloadPage('teacherAssistant', null, () => {
  installTeacherAssistant();
});
