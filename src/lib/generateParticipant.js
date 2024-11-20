
exports.generateDefaultParticipants = (count) => {
    const rangeArray = Array.from({ length: count }, (_, i) => i + 1);
    return rangeArray.map((item) => {
        return {
            name: `Участник ${item}`,
        }
    })
};

