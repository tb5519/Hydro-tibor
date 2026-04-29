import { $, addPage, NamedPage, UserSelectAutoComplete } from '@hydrooj/ui-default'

addPage(new NamedPage(['badge_add','badge_edit'], () => {
    UserSelectAutoComplete.getOrConstruct<true>($('[name="users"]'), { 
        multi: true, clearDefaultValue: false 
    });
}));