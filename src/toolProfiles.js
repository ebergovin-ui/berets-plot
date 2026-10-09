export const toolDefaults={pen:{penLiftMm:1.5},marker:{penLiftMm:2},pencil:{penLiftMm:5}};
export function switchTool(settings,key){
 const profiles={...toolDefaults,...settings.toolProfiles,[settings.toolKey||'pencil']:{penLiftMm:settings.penLiftMm}};
 const selected=profiles[key]||toolDefaults.pencil;
 const penUpZ=Math.max(settings.penDownZ||1,settings.penProtrusion||5)+selected.penLiftMm;
 return {...settings,toolKey:key,toolProfiles:profiles,...selected,penUpZ,safeZ:penUpZ};
}
