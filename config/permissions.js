module.exports = {

    'faq': {
        allowedRoles: ['Moonwarden', 'Nightwatch', 'Owlkeeper', 'Stargazer', "Moonbound"],
    },
    'docs': {
        allowedRoles: ['Moonwarden', 'Nightwatch', 'Owlkeeper', 'Stargazer', "Moonbound"],
    },
    'rr': {
        allowedRoles: ['Moonwarden'],
    },
    'honeypot': {
        allowedRoles: ['Moonwarden'],
    },
    'github': {
        allowedRoles: ['Moonwarden'],
    },
    'logging': {
        allowedRoles: ['Moonwarden'],
    },
    'support': {
        allowedRoles: ['Moonwarden', 'Nightwatch', 'Owlkeeper'],
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
