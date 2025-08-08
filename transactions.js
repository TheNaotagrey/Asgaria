const inventaireFields = [
  'or_','pierre','fer','lingot_or','antidote','armureries','rhum','grague','vivres','architectes','charpentiers','maitres_oeuvre','maitre_espions','points_magique',
  'fourrure','ivoire','soie','huile','teinture','epices','sel','perle','encens','vin','pierre_precieuse','esclaves','prestige','renommee'
];

function performTransaction(db, seigneurieId, resource, amount, cb){
  if(!inventaireFields.includes(resource)) return cb(new Error('Invalid resource'));
  db.serialize(()=>{
    db.run(`UPDATE inventaire SET ${resource} = ${resource} + ? WHERE id = (SELECT inventaire_id FROM seigneuries WHERE id=?)`,
      [amount, seigneurieId], function(err){
        if(err) return cb(err);
        db.run('INSERT INTO transactions (seigneurie_id, resource, amount) VALUES (?,?,?)',
          [seigneurieId, resource, amount], cb);
      });
  });
}

module.exports = {inventaireFields, performTransaction};
