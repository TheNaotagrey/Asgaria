const sendNotification = (db, userIds, message, link = null, cb = () => {}) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const stmt = db.prepare('INSERT INTO notifications(user_id,message,link) VALUES (?,?,?)');
  ids.forEach(id => stmt.run(id, message, link));
  stmt.finalize(cb);
};

module.exports = { sendNotification };
