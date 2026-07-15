# Supported imagery in Rapid

{
    "id": "ExampleImagery",
    "name": "My Imagery",
    "type": "tms",
    "template": "http://{switch:a,b,c}.tiles.example.com/{z}/{x}/{y}.png"
}

WA-Tech imagery - https://waprovisoimg.centralindia.cloudapp.azure.com/arcgis/services/ImageServices/Statewide_2023_1ft_4band_wsps_83h_img/ImageServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox}&CRS={proj}&WIDTH={width}&HEIGHT={height}&LAYERS=Statewide_2023_1ft_4band_wsps_83h_img&STYLES=&FORMAT=image%2fpng&DPI=144&MAP_RESOLUTION=144&FORMAT_OPTIONS=dpi%3A144&TRANSPARENT=TRUE

## Example WA-tech imagery shall be

```json
{
    "id": "wa-tech",
    "name": "Wa-Tech",
    "type": "tms",
    "template": "https://waprovisoimg.centralindia.cloudapp.azure.com/arcgis/services/ImageServices/Statewide_2023_1ft_4band_wsps_83h_img/ImageServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox}&CRS={proj}&WIDTH={width}&HEIGHT={height}&LAYERS=Statewide_2023_1ft_4band_wsps_83h_img&STYLES=&FORMAT=image%2fpng&DPI=144&MAP_RESOLUTION=144&FORMAT_OPTIONS=dpi%3A144&TRANSPARENT=TRUE"
}
```
