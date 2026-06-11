module.exports = {

    'faq': {
        allowedRoles: ['Moonwarden', 'Owlkeeper', 'Stargazer', "Moonbound"],
    },
    'docs': {
        allowedRoles: ['Moonwarden', 'Owlkeeper', 'Stargazer', "Moonbound"],
    },
    'rr': {
        allowedRoles: ['Moonwarden'],
    },
    'honeypot': {
        allowedRoles: ['Moonwarden'],
    },
    
    // Role that can trigger the mention handler
    'mentionHandler': {
        triggerRole: 'Moonwarden',
    },
    
    // Role that can downvote bot responses (for learning)
    'downvote': {
        allowedRoles: ['Moonwarden'],
    },
};

