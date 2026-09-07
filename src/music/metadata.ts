/** Also handles legacy names retained in session-stored search results. */
export const displayArtist = (value: string) => value.replace(/Sch[\p{Script=Han}\uFFFD]+berg/gu, 'Schönberg');
