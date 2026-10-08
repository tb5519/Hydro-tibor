import { bindStudentManagement } from 'vj/components/student_management';
import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('manage_user_management', () => bindStudentManagement(document));
