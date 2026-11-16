import moment from 'moment-timezone';

// ISO weeks always start on Monday. Keep the full natural week separate from
// the Sunday 22:00 deadline used to settle the weekly first-AC leaderboard.
export function calendarWeek(now = new Date(), timeZone = 'Asia/Shanghai') {
    const start = moment(now).tz(timeZone).startOf('isoWeek');
    return {
        start: start.toDate(),
        nextStart: start.clone().add(1, 'week').toDate(),
        acCutoff: start.clone().add(6, 'days').hour(22).toDate(),
    };
}
