import type {
  AdiffElement,
  AdiffRelationMember,
  AugmentedDiff,
} from '~/types/adiff';

function prepareRelationMember(
  member: AdiffRelationMember,
): AdiffRelationMember | undefined {
  if (member.type === 'node') {
    return Number.isFinite(Number(member.lat)) && Number.isFinite(Number(member.lon))
      ? member
      : undefined;
  }

  if (member.type === 'way') {
    if (!Array.isArray(member.nodes)) {
      return undefined;
    }

    const nodes = member.nodes.filter(node =>
      Number.isFinite(Number(node.lat)) && Number.isFinite(Number(node.lon)),
    );

    return nodes.length >= 2 ? { ...member, nodes } : undefined;
  }

  const members = (member.members ?? [])
    .map(prepareRelationMember)
    .filter(member => member !== undefined);

  return members.length > 0 ? { ...member, members } : undefined;
}

function prepareElement(element: AdiffElement): AdiffElement {
  if (element.type !== 'relation') {
    return element;
  }

  return {
    ...element,
    members: element.members
      .map(prepareRelationMember)
      .filter(member => member !== undefined),
  };
}

/** Remove relation references that the map viewer cannot convert into geometry. */
export function prepareAdiffForMap(adiff: AugmentedDiff): AugmentedDiff {
  return {
    ...adiff,
    actions: adiff.actions.map(action => ({
      ...action,
      new: prepareElement(action.new),
      old: action.old ? prepareElement(action.old) : undefined,
    })),
  };
}
