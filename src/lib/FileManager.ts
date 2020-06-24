import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Axios from 'axios';


const streamToFile = (
	inputStream: any,
	outPath: string,
): Promise<void> => (
	new Promise( ( resolve, reject ) => {
		const fileWriteStream = fs.createWriteStream( outPath );
		inputStream
			.pipe( fileWriteStream )
			.on( 'finish', resolve )
			.on( 'error', reject );
	})
);


export default class FileManager {
	public files = new Map<string, string>();
	public outDir: string;


	constructor( outDir: string ) {
		this.outDir = outDir;
		fs.mkdirSync( path.resolve( this.outDir, 'files' ), { recursive: true });
	}


	public track( url: string ): string {
		const ext = url.split( /#|\?/ )[0].split( '.' ).pop().trim();
		this.files.set(
			url,
			`${crypto.createHash( 'md5' ).update( url ).digest( 'hex' )}.${ext}`,
		);

		return url;
	}


	public write( name: string, a: any ): Promise<void> {
		const imports: string[] = [];
		let outStr = JSON.stringify( a );
		this.files.forEach( ( outName, inName ) => {
			const hash = outName.split( '.' )[0];
			const varName = `file${hash}`;
			const absName = `"${inName}"`;

			if ( outStr.includes( absName ) ) {
				imports.push( `import ${varName} from './files/${outName}';` );
				outStr = outStr.split( absName ).join( varName );
			}
		});

		const exportName = name.replace( /^[^a-zA-Z_$]|[^\w$]/g, '_' );

		return fs.promises.writeFile(
			path.resolve( this.outDir, `${name}.ts` ),
			`// AUTOGENERATED FILE, DO NOT EDIT\n\n${
				imports.join( '\n' )
			}\n\nconst ${
				exportName
			} = ${
				outStr
			};\n\nexport default ${
				exportName
			};\n`,
		);
	}


	public downloadAll(): Promise<unknown> {
		const promises: Promise<unknown>[] = [];

		this.files.forEach( ( fileName, url ) => {
			const outPath = path.resolve( this.outDir, 'files/', fileName );
			promises.push(
				fs.promises.stat( outPath )
					// only download file if it doesn't already exist
					.catch( () => Axios({
						url,
						method: 'GET',
						responseType: 'stream',
					}).then( response => streamToFile( response.data, outPath ) ) ),
			);
		});

		return Promise.all( promises )
			.then( () => fs.promises.readdir( path.resolve( this.outDir, 'files/' ) ) )
			.then( ( allFiles ) => {
				const neededFiles = Array.from( this.files.values() );

				const deletableFiles = allFiles.filter( s => !neededFiles.includes( s ) );

				return Promise.all(
					deletableFiles.map(
						file => fs.promises.unlink(
							path.resolve( this.outDir, 'files/', file ),
						),
					),
				);
			});
	}
}
